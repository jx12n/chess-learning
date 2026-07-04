//! Truth core — the only source of truth about chess.
//!
//! Compiled once to WASM and used unchanged in the browser (play surface)
//! and in Node (curriculum tooling, verifier, tests): no legality drift.
//!
//! Tool API surface (all functions take/return JSON strings and wrap
//! results in an `{ok, data | error}` envelope so behavior is identical
//! on both sides of the JS boundary):
//!
//! - `legal_moves(fen, constraints_json?)`
//! - `apply_move(fen, uci)`
//! - `game_result(fen)`
//! - `evaluate(fen)`            — DEFERRED seam, returns "unavailable"
//! - `perft_count(fen, depth)`
//! - `scenario_legal_moves(scenario_json, fen)`
//! - `scenario_apply(scenario_json, fen, uci)`
//! - `scenario_result(scenario_json, fen)`

mod engine;
mod scenario;

pub use scenario::{Constraints, Goal, Opponent, Scenario};

use serde::Serialize;
use shakmaty::Position;
use wasm_bindgen::prelude::*;

fn envelope<T: Serialize>(result: Result<T, String>) -> String {
    #[derive(Serialize)]
    #[serde(untagged)]
    enum Envelope<T> {
        Ok { ok: bool, data: T },
        Err { ok: bool, error: String },
    }
    let e = match result {
        Ok(data) => Envelope::Ok { ok: true, data },
        Err(error) => Envelope::Err { ok: false, error },
    };
    serde_json::to_string(&e).expect("envelope serialization cannot fail")
}

fn parse_constraints(json: &str) -> Result<Option<scenario::Constraints>, String> {
    let trimmed = json.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(None);
    }
    serde_json::from_str(trimmed)
        .map(Some)
        .map_err(|e| format!("invalid constraints: {e}"))
}

/// Legal moves in `fen`, optionally narrowed by a constraints JSON object
/// (pass "" or "null" for full chess rules).
#[wasm_bindgen]
pub fn legal_moves(fen: &str, constraints_json: &str) -> String {
    envelope((|| {
        let constraints = parse_constraints(constraints_json)?;
        let pos = engine::parse_fen(fen)?;
        let moves = scenario::filter_legal_moves(&pos, constraints.as_ref());
        Ok(moves
            .iter()
            .map(|m| engine::move_info(&pos, m))
            .collect::<Vec<_>>())
    })())
}

/// Apply a UCI move to `fen` under full chess rules; returns the new FEN.
#[wasm_bindgen]
pub fn apply_move(fen: &str, uci: &str) -> String {
    envelope((|| {
        let pos = engine::parse_fen(fen)?;
        let m = engine::find_move(&engine::legal_moves(&pos), uci)?;
        let next = pos
            .play(&m)
            .map_err(|e| format!("could not apply '{uci}': {e}"))?;
        Ok(engine::to_fen(&next))
    })())
}

/// Standard chess result of `fen`: ongoing / win / draw (+reason, check).
#[wasm_bindgen]
pub fn game_result(fen: &str) -> String {
    envelope(engine::parse_fen(fen).map(|pos| engine::game_result(&pos)))
}

/// DEFERRED seam for the engine oracle (Stockfish/UCI). Always
/// "unavailable" today; the contract exists so callers are already
/// written against it.
#[wasm_bindgen]
pub fn evaluate(fen: &str) -> String {
    #[derive(Serialize)]
    struct Eval {
        status: String,
    }
    envelope(engine::parse_fen(fen).map(|_| Eval {
        status: "unavailable".into(),
    }))
}

/// Perft node count — the P1 correctness gate and a debugging aid.
#[wasm_bindgen]
pub fn perft_count(fen: &str, depth: u32) -> String {
    envelope(engine::parse_fen(fen).map(|pos| engine::perft(&pos, depth)))
}

/// Legal moves under a scenario's constraints and rules model.
#[wasm_bindgen]
pub fn scenario_legal_moves(scenario_json: &str, fen: &str) -> String {
    envelope((|| {
        let s = scenario::Scenario::from_json(scenario_json)?;
        scenario::scenario_move_infos(&s, fen)
    })())
}

/// Apply a move under a scenario's rules (turn reset for opponentless
/// mini-games); returns the new FEN.
#[wasm_bindgen]
pub fn scenario_apply(scenario_json: &str, fen: &str, uci: &str) -> String {
    envelope((|| {
        let s = scenario::Scenario::from_json(scenario_json)?;
        scenario::scenario_apply(&s, fen, uci)
    })())
}

/// Scenario status at `fen`: ongoing / goal-met / failed (+moves used/left).
#[wasm_bindgen]
pub fn scenario_result(scenario_json: &str, fen: &str) -> String {
    envelope((|| {
        let s = scenario::Scenario::from_json(scenario_json)?;
        scenario::scenario_result(&s, fen)
    })())
}

/// Core version, for sanity checks across the JS boundary.
#[wasm_bindgen]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_shapes_are_stable() {
        let ok = game_result("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        assert!(ok.starts_with(r#"{"ok":true,"data":"#), "{ok}");
        let err = game_result("not a fen");
        assert!(err.starts_with(r#"{"ok":false,"error":"#), "{err}");
    }

    #[test]
    fn evaluate_is_a_stub() {
        let out = evaluate("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        assert!(out.contains("unavailable"), "{out}");
    }

    #[test]
    fn legal_moves_accepts_empty_constraints() {
        let out = legal_moves(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "",
        );
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["data"].as_array().unwrap().len(), 20);
    }

    #[test]
    fn legal_moves_respects_constraints() {
        let out = legal_moves(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            r#"{"pieces":["N"]}"#,
        );
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        let moves = v["data"].as_array().unwrap();
        assert_eq!(moves.len(), 4);
        assert!(moves.iter().all(|m| m["piece"] == "N"));
    }
}
