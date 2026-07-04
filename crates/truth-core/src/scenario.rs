//! Constraint layer: mini-games as data.
//!
//! A `Scenario` teaches a *subset* of chess: it restricts which pieces may
//! move and replaces the win condition with a custom goal. Mini-games use
//! the "movement" rules model — piece movement, captures and blocking are
//! exactly real chess (generated from shakmaty's attack tables, never
//! hand-rolled), but there is no check/checkmate semantics and kings are
//! not required on the board. That is the pedagogically honest model for
//! lessons that come *before* the learner knows what check is, and it is
//! why the roadmap's scenario FENs are kingless.
//!
//! The `rules: "standard"` variant (full legality, for check/mate lessons
//! later in "The Basics") is a declared seam: the schema carries it, the
//! full-rules engine already exists in `engine.rs`, but wiring it up is
//! deferred until a lesson needs it.
//!
//! Invariants the constraint layer guarantees:
//! - it only ever *narrows* real chess movement — a scenario can never
//!   make a chess-impossible movement legal (no jumping, no pass-through);
//! - kings, when present, are scenery: they may be blocked around but can
//!   never be captured.

use serde::{Deserialize, Serialize};
use shakmaty::{attacks, fen::Fen, Bitboard, Board, CastlingMode, Color, Move, Rank, Role, Setup};
use std::num::NonZeroU32;

use crate::engine::{self, MoveInfo};

/// Restriction of the legal-move set. Absent fields mean "unrestricted".
#[derive(Deserialize, Serialize, Clone, Default)]
pub struct Constraints {
    /// Roles allowed to move, as uppercase FEN letters (side-agnostic),
    /// e.g. `["R"]` for rook-only mini-games.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pieces: Option<Vec<String>>,
    /// Declarative label for the movement rules taught ("rook-lines",
    /// "all", ...). Documentation for authors/agents; filtering is done
    /// by `pieces`/`castling`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moves: Option<String>,
    /// Whether castling is available. Defaults to true for standard rules;
    /// the movement model never offers castling.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub castling: Option<bool>,
}

impl Constraints {
    fn allows_role(&self, role: Role) -> bool {
        match &self.pieces {
            None => true,
            Some(pieces) => {
                let letter = role.upper_char().to_string();
                pieces.iter().any(|p| p.eq_ignore_ascii_case(&letter))
            }
        }
    }
}

/// Custom win condition for a mini-game.
#[derive(Deserialize, Serialize, Clone)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum Goal {
    /// Capture every piece named by `targets`: FEN letters, case = color
    /// (e.g. "p" = all black pawns). Multiple letters allowed ("pn").
    CaptureAll { targets: String },
    /// Get the given piece (FEN letter, case = color) onto `square`.
    ReachSquare { square: String, piece: String },
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Opponent {
    /// The learner's side is the only one that moves.
    #[default]
    None,
    /// Seam for a future engine opponent (Maia-style). Not implemented.
    Engine,
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Rules {
    /// Movement subset: real piece movement/captures/blocking, no check
    /// semantics, kings optional. For lessons before check is taught.
    #[default]
    Movement,
    /// Full chess legality. Declared seam; not wired up yet.
    Standard,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Scenario {
    pub id: String,
    #[serde(rename = "startFEN")]
    pub start_fen: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allowed: Option<Constraints>,
    pub goal: Goal,
    #[serde(default)]
    pub opponent: Opponent,
    #[serde(default)]
    pub rules: Rules,
    /// Max number of learner moves; `null` = unlimited.
    #[serde(rename = "movesBudget", default, skip_serializing_if = "Option::is_none")]
    pub moves_budget: Option<u32>,
}

impl Scenario {
    pub fn from_json(json: &str) -> Result<Scenario, String> {
        serde_json::from_str(json).map_err(|e| format!("invalid scenario: {e}"))
    }

    fn check_supported(&self) -> Result<(), String> {
        if self.rules == Rules::Standard {
            return Err("scenario rules 'standard' is a deferred seam, not implemented".into());
        }
        if self.opponent == Opponent::Engine {
            return Err("scenario opponent 'engine' is a deferred seam, not implemented".into());
        }
        Ok(())
    }
}

/// A scenario position: piece placement + whose turn + moves used so far.
/// Round-trips through FEN (fullmove counter = 1 + moves used).
struct MiniState {
    setup: Setup,
}

impl MiniState {
    fn parse(fen: &str) -> Result<MiniState, String> {
        let parsed: Fen = fen
            .trim()
            .parse()
            .map_err(|e| format!("invalid FEN '{fen}': {e}"))?;
        let mut setup = parsed.0;
        setup.ep_square = None; // no en passant in the movement model
        Ok(MiniState { setup })
    }

    fn board(&self) -> &Board {
        &self.setup.board
    }

    fn mover(&self) -> Color {
        self.setup.turn
    }

    fn to_fen(&self) -> String {
        Fen(self.setup.clone()).to_string()
    }
}

/// Movement-model move generation from shakmaty's attack tables:
/// slides/steps/blocking/captures are real chess; no check filtering,
/// no castling, no en passant; kings can never be captured.
fn movement_moves(board: &Board, mover: Color, allowed: Option<&Constraints>) -> Vec<Move> {
    let occupied = board.occupied();
    let own = board.by_color(mover);
    let enemy = board.by_color(!mover);
    let kings = board.by_role(Role::King);
    let mut out = Vec::new();

    for (from, piece) in board.iter() {
        if piece.color != mover {
            continue;
        }
        if let Some(c) = allowed {
            if !c.allows_role(piece.role) {
                continue;
            }
        }
        if piece.role == Role::Pawn {
            let last_rank = match mover {
                Color::White => Rank::Eighth,
                Color::Black => Rank::First,
            };
            let promo = |to: shakmaty::Square| {
                (to.rank() == last_rank).then_some(Role::Queen)
            };
            // Captures (never of kings).
            for to in attacks::pawn_attacks(mover, from) & enemy & !kings {
                out.push(Move::Normal {
                    role: Role::Pawn,
                    from,
                    capture: board.role_at(to),
                    to,
                    promotion: promo(to),
                });
            }
            // Pushes.
            let dir: i32 = if mover == Color::White { 8 } else { -8 };
            if let Some(one) = from.offset(dir) {
                if !occupied.contains(one) {
                    out.push(Move::Normal {
                        role: Role::Pawn,
                        from,
                        capture: None,
                        to: one,
                        promotion: promo(one),
                    });
                    let start_rank = match mover {
                        Color::White => Rank::Second,
                        Color::Black => Rank::Seventh,
                    };
                    if from.rank() == start_rank {
                        if let Some(two) = from.offset(2 * dir) {
                            if !occupied.contains(two) {
                                out.push(Move::Normal {
                                    role: Role::Pawn,
                                    from,
                                    capture: None,
                                    to: two,
                                    promotion: None,
                                });
                            }
                        }
                    }
                }
            }
        } else {
            let targets = attacks::attacks(from, piece, occupied) & !own & !kings;
            for to in targets {
                out.push(Move::Normal {
                    role: piece.role,
                    from,
                    capture: board.role_at(to),
                    to,
                    promotion: None,
                });
            }
        }
    }
    out
}

/// Minimal SAN-style rendering for movement-model moves (presentation
/// only): "Re4", "Rxe5", "e4", "fxe5", "e8=Q"; falls back to including
/// the origin square when two allowed same-role pieces share a target.
fn movement_san(board: &Board, mover: Color, all_moves: &[Move], m: &Move) -> String {
    let (role, from, capture, to, promotion) = match m {
        Move::Normal {
            role,
            from,
            capture,
            to,
            promotion,
        } => (*role, *from, capture.is_some(), *to, *promotion),
        _ => return m.to_string(),
    };
    let _ = (board, mover);
    let mut s = String::new();
    if role == Role::Pawn {
        if capture {
            s.push(from.file().char());
            s.push('x');
        }
        s.push_str(&to.to_string());
    } else {
        s.push(role.upper_char());
        let ambiguous = all_moves.iter().any(|other| match other {
            Move::Normal {
                role: r,
                from: f,
                to: t,
                ..
            } => *r == role && *t == to && *f != from,
            _ => false,
        });
        if ambiguous {
            s.push_str(&from.to_string());
        }
        if capture {
            s.push('x');
        }
        s.push_str(&to.to_string());
    }
    if let Some(p) = promotion {
        s.push('=');
        s.push(p.upper_char());
    }
    s
}

/// Legal moves in `fen` under the scenario's constraints and rules model.
pub fn scenario_legal_moves(scenario: &Scenario, fen: &str) -> Result<Vec<Move>, String> {
    scenario.check_supported()?;
    let state = MiniState::parse(fen)?;
    Ok(movement_moves(
        state.board(),
        state.mover(),
        scenario.allowed.as_ref(),
    ))
}

/// Wire-format move list for a scenario position.
pub fn scenario_move_infos(scenario: &Scenario, fen: &str) -> Result<Vec<MoveInfo>, String> {
    let state = MiniState::parse(fen)?;
    let moves = scenario_legal_moves(scenario, fen)?;
    Ok(moves
        .iter()
        .map(|m| MoveInfo {
            uci: m.to_uci(CastlingMode::Standard).to_string(),
            san: movement_san(state.board(), state.mover(), &moves, m),
            from: m.from().map(|s| s.to_string()),
            to: m.to().to_string(),
            piece: engine::piece_letter(m.role(), state.mover()),
            capture: m.is_capture(),
            castle: false,
        })
        .collect())
}

/// Legal moves of a *standard* position narrowed by bare constraints
/// (used by the full-rules `legal_moves` tool API).
pub fn filter_legal_moves(pos: &shakmaty::Chess, constraints: Option<&Constraints>) -> Vec<Move> {
    engine::legal_moves(pos)
        .into_iter()
        .filter(|m| {
            let Some(c) = constraints else { return true };
            if c.castling == Some(false) && m.is_castle() {
                return false;
            }
            c.allows_role(m.role())
        })
        .collect()
}

/// Apply a UCI move under the scenario's rules. Rejects constraint-illegal
/// moves. The mover keeps the turn (`opponent: none`) and the fullmove
/// counter advances by one — it is the move-budget clock.
pub fn scenario_apply(scenario: &Scenario, fen: &str, uci: &str) -> Result<String, String> {
    let mut state = MiniState::parse(fen)?;
    let candidates = scenario_legal_moves(scenario, fen)?;
    let m = engine::find_move(&candidates, uci)?;

    let (from, to, promotion, role) = match &m {
        Move::Normal {
            from,
            to,
            promotion,
            role,
            ..
        } => (*from, *to, *promotion, *role),
        _ => return Err("movement model only produces normal moves".into()),
    };
    let mover = state.mover();
    let board = &mut state.setup.board;
    let _moved = board.remove_piece_at(from);
    board.set_piece_at(
        to,
        shakmaty::Piece {
            color: mover,
            role: promotion.unwrap_or(role),
        },
    );

    state.setup.turn = mover; // opponent: none — learner keeps the move
    state.setup.halfmoves = 0;
    let next = state.setup.fullmoves.get().saturating_add(1);
    state.setup.fullmoves = NonZeroU32::new(next).unwrap_or(NonZeroU32::MIN);
    Ok(state.to_fen())
}

#[derive(Serialize)]
pub struct ScenarioResult {
    /// "ongoing" | "goal-met" | "failed"
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(rename = "movesUsed")]
    pub moves_used: u32,
    /// Remaining budget; absent when the budget is unlimited.
    #[serde(rename = "movesLeft", skip_serializing_if = "Option::is_none")]
    pub moves_left: Option<u32>,
}

pub fn goal_met(goal: &Goal, board: &Board) -> Result<bool, String> {
    match goal {
        Goal::CaptureAll { targets } => {
            if targets.is_empty() {
                return Err("capture-all goal has empty targets".into());
            }
            for letter in targets.chars() {
                let (color, role) = engine::parse_piece_letter(letter)?;
                let remaining: Bitboard = board.by_color(color) & board.by_role(role);
                if remaining.any() {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        Goal::ReachSquare { square, piece } => {
            let sq = engine::parse_square(square)?;
            let mut chars = piece.chars();
            let letter = match (chars.next(), chars.next()) {
                (Some(l), None) => l,
                _ => return Err(format!("invalid goal piece '{piece}'")),
            };
            let (color, role) = engine::parse_piece_letter(letter)?;
            Ok(board.piece_at(sq) == Some(shakmaty::Piece { color, role }))
        }
    }
}

/// Evaluate a scenario position: goal met, budget exhausted, stuck, or ongoing.
pub fn scenario_result(scenario: &Scenario, fen: &str) -> Result<ScenarioResult, String> {
    scenario.check_supported()?;
    let state = MiniState::parse(fen)?;
    let start = MiniState::parse(&scenario.start_fen)?;
    let used = state
        .setup
        .fullmoves
        .get()
        .saturating_sub(start.setup.fullmoves.get());
    let left = scenario.moves_budget.map(|b| b.saturating_sub(used));

    if goal_met(&scenario.goal, state.board())? {
        return Ok(ScenarioResult {
            status: "goal-met".into(),
            reason: None,
            moves_used: used,
            moves_left: left,
        });
    }
    if left == Some(0) {
        return Ok(ScenarioResult {
            status: "failed".into(),
            reason: Some("moves-budget-exhausted".into()),
            moves_used: used,
            moves_left: left,
        });
    }
    if scenario_legal_moves(scenario, fen)?.is_empty() {
        return Ok(ScenarioResult {
            status: "failed".into(),
            reason: Some("no-legal-moves".into()),
            moves_used: used,
            moves_left: left,
        });
    }
    Ok(ScenarioResult {
        status: "ongoing".into(),
        reason: None,
        moves_used: used,
        moves_left: left,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Rook Gobble: white rook eats three black pawns. Kingless, exactly
    /// like the roadmap's example scenario.
    fn gobble() -> Scenario {
        Scenario::from_json(
            r#"{
              "id": "test-gobble",
              "startFEN": "8/2p5/8/4p3/8/1p6/8/R7 w - - 0 1",
              "allowed": { "pieces": ["R"], "moves": "rook-lines", "castling": false },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none",
              "movesBudget": null
            }"#,
        )
        .unwrap()
    }

    /// Rook Race: get the rook from a1 to h8 around a wall of friendly
    /// pawns (blocking, no pass-through) within the budget.
    fn race() -> Scenario {
        Scenario::from_json(
            r#"{
              "id": "test-race",
              "startFEN": "8/8/8/8/1PPPPPPP/8/8/R7 w - - 0 1",
              "allowed": { "pieces": ["R"], "moves": "rook-lines", "castling": false },
              "goal": { "type": "reach-square", "square": "h8", "piece": "R" },
              "opponent": "none",
              "movesBudget": 4
            }"#,
        )
        .unwrap()
    }

    #[test]
    fn constraints_only_allow_rook_moves() {
        let s = gobble();
        let moves = scenario_legal_moves(&s, &s.start_fen).unwrap();
        assert!(!moves.is_empty());
        assert!(moves.iter().all(|m| m.role() == Role::Rook));
    }

    #[test]
    fn movement_matches_real_rook_geometry() {
        // Rook on a1, pawn (own color would block; enemy is capturable).
        // Compare against full-rules shakmaty on an equivalent position
        // with kings parked out of the way: the movement model must agree
        // exactly on the rook's options.
        let s = Scenario::from_json(
            r#"{
              "id": "geometry",
              "startFEN": "8/8/8/4p3/8/8/8/4R3 w - - 0 1",
              "allowed": { "pieces": ["R"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        )
        .unwrap();
        let mini: std::collections::BTreeSet<String> = scenario_legal_moves(&s, &s.start_fen)
            .unwrap()
            .iter()
            .map(|m| m.to_uci(CastlingMode::Standard).to_string())
            .collect();

        // Kings parked off the rook's lines so they don't perturb geometry.
        let full = engine::parse_fen("7k/1K6/8/4p3/8/8/8/4R3 w - - 0 1").unwrap();
        let reference: std::collections::BTreeSet<String> =
            filter_legal_moves(&full, Some(&Constraints {
                pieces: Some(vec!["R".into()]),
                moves: None,
                castling: None,
            }))
            .iter()
            .map(|m| m.to_uci(CastlingMode::Standard).to_string())
            .collect();
        assert_eq!(mini, reference);
    }

    #[test]
    fn gobble_is_winnable_by_eating_all_pawns() {
        // P2 gate: Gobble playable end to end in a test.
        let s = gobble();
        let mut fen = s.start_fen.clone();
        for uci in ["a1b1", "b1b3", "b3e3", "e3e5", "e5c5", "c5c7"] {
            assert_eq!(scenario_result(&s, &fen).unwrap().status, "ongoing");
            fen = scenario_apply(&s, &fen, uci).unwrap();
        }
        let r = scenario_result(&s, &fen).unwrap();
        assert_eq!(r.status, "goal-met");
        assert_eq!(r.moves_used, 6);
    }

    #[test]
    fn race_blocks_pass_through_and_meets_goal() {
        let s = race();
        let fen2 = scenario_apply(&s, &s.start_fen, "a1a4").unwrap();
        // Rook cannot jump the wall along rank 4: b4 is a friendly pawn.
        let moves2 = scenario_legal_moves(&s, &fen2).unwrap();
        assert!(moves2
            .iter()
            .all(|m| m.to_uci(CastlingMode::Standard).to_string() != "a4c4"));

        // Win inside the budget: a1a8, a8h8.
        let mut fen = s.start_fen.clone();
        fen = scenario_apply(&s, &fen, "a1a8").unwrap();
        fen = scenario_apply(&s, &fen, "a8h8").unwrap();
        let r = scenario_result(&s, &fen).unwrap();
        assert_eq!(r.status, "goal-met");
        assert_eq!(r.moves_used, 2);
        assert_eq!(r.moves_left, Some(2));
    }

    #[test]
    fn race_fails_when_budget_exhausted() {
        let s = race();
        let mut fen = s.start_fen.clone();
        for uci in ["a1a2", "a2a1", "a1a2", "a2a1"] {
            fen = scenario_apply(&s, &fen, uci).unwrap();
        }
        let r = scenario_result(&s, &fen).unwrap();
        assert_eq!(r.status, "failed");
        assert_eq!(r.reason.as_deref(), Some("moves-budget-exhausted"));
    }

    #[test]
    fn constraint_illegal_moves_are_rejected() {
        // Kings present but not in the allowed set: they can't move, and
        // the rook can't be teleported.
        let s = Scenario::from_json(
            r#"{
              "id": "guarded",
              "startFEN": "7k/8/8/8/8/8/8/R6K w - - 0 1",
              "allowed": { "pieces": ["R"] },
              "goal": { "type": "reach-square", "square": "a8", "piece": "R" },
              "opponent": "none"
            }"#,
        )
        .unwrap();
        // King move is filtered by constraints.
        assert!(scenario_apply(&s, &s.start_fen, "h1h2").is_err());
        // Rook cannot jump to a non-line square.
        assert!(scenario_apply(&s, &s.start_fen, "a1b3").is_err());
    }

    #[test]
    fn kings_are_scenery_and_can_never_be_captured() {
        // Rook aimed straight at the parked black king.
        let s = Scenario::from_json(
            r#"{
              "id": "no-regicide",
              "startFEN": "k7/8/8/8/8/8/8/R7 w - - 0 1",
              "allowed": { "pieces": ["R"] },
              "goal": { "type": "reach-square", "square": "h1", "piece": "R" },
              "opponent": "none"
            }"#,
        )
        .unwrap();
        let moves = scenario_legal_moves(&s, &s.start_fen).unwrap();
        // a1a8 (capturing the king) must not exist; a1a7 must.
        let ucis: Vec<String> = moves
            .iter()
            .map(|m| m.to_uci(CastlingMode::Standard).to_string())
            .collect();
        assert!(!ucis.contains(&"a1a8".to_string()));
        assert!(ucis.contains(&"a1a7".to_string()));
    }

    #[test]
    fn turn_stays_with_the_learner() {
        let s = gobble();
        let fen = scenario_apply(&s, &s.start_fen, "a1a8").unwrap();
        assert!(fen.contains(" w "), "turn must stay white, got {fen}");
        assert!(!scenario_legal_moves(&s, &fen).unwrap().is_empty());
    }

    #[test]
    fn standard_rules_is_a_declared_seam() {
        let s = Scenario::from_json(
            r#"{
              "id": "std",
              "startFEN": "7k/8/8/8/8/8/8/R6K w - - 0 1",
              "allowed": { "pieces": ["R"] },
              "goal": { "type": "reach-square", "square": "a8", "piece": "R" },
              "rules": "standard"
            }"#,
        )
        .unwrap();
        assert!(scenario_legal_moves(&s, &s.start_fen)
            .unwrap_err()
            .contains("deferred seam"));
    }

    #[test]
    fn movement_san_is_reasonable() {
        let s = gobble();
        let infos = scenario_move_infos(&s, &s.start_fen).unwrap();
        assert_eq!(infos.iter().find(|i| i.uci == "a1b1").unwrap().san, "Rb1");
        assert_eq!(infos.iter().find(|i| i.uci == "a1a3").unwrap().san, "Ra3");
        // And a capture renders with 'x': play to b1, then take the b3 pawn.
        let fen = scenario_apply(&s, &s.start_fen, "a1b1").unwrap();
        let infos = scenario_move_infos(&s, &fen).unwrap();
        let take = infos.iter().find(|i| i.uci == "b1b3").unwrap();
        assert!(take.capture);
        assert_eq!(take.san, "Rxb3");
    }
}
