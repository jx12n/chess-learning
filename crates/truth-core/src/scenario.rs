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
//! The `rules: "standard"` variant is full legality via shakmaty movegen
//! — the model for the check/mate lessons. Decisions D1–D4
//! (docs/architecture-review.md): standard scenarios never turn-reset;
//! without an opponent they are single-move exercises; the check-family
//! goals exist only under standard rules; the deterministic `greedy`
//! opponent keeps verification a pure search.
//!
//! Invariants the constraint layer guarantees:
//! - it only ever *narrows* real chess movement — a scenario can never
//!   make a chess-impossible movement legal (no jumping, no pass-through);
//! - kings, when present, are scenery under the movement model: they may
//!   be blocked around but can never be captured.

use serde::{Deserialize, Serialize};
use shakmaty::{
    attacks, fen::Fen, Bitboard, Board, CastlingMode, Color, Move, Position, Rank, Role, Setup,
};
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
    /// The learner's move leaves the enemy in check. Standard rules only.
    GiveCheck,
    /// The learner's move checkmates the enemy. Standard rules only.
    Checkmate,
    /// The start position has the learner in check; any legal move
    /// escapes (legality is the proof). Standard rules only, and the
    /// start position must actually be check (validated).
    EscapeCheck,
    /// Last `moves` learner moves without losing a single piece to the
    /// opponent. Movement rules with an opponent; `movesBudget` must
    /// equal `moves`. The goal is judged only once the opponent has
    /// answered the final move — the last move must be safe too.
    Survive { moves: u32 },
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Opponent {
    /// The learner's side is the only one that moves.
    #[default]
    None,
    /// Deterministic greedy opponent (decision D3): plays the
    /// highest-value capture, breaking ties by lexicographic UCI, and
    /// the lexicographically first move when no capture exists.
    /// Constraints bind the learner only — the opponent moves its whole
    /// army. Determinism keeps verification a pure search.
    Greedy,
    /// Seam for a future human-like engine opponent (Maia-style).
    /// Not implemented.
    Engine,
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Rules {
    /// Movement subset: real piece movement/captures/blocking, no check
    /// semantics, kings optional. For lessons before check is taught.
    #[default]
    Movement,
    /// Full chess legality via shakmaty movegen — the check/mate
    /// lessons' model. Decision D1: turn alternation IS the rules, so
    /// standard scenarios never turn-reset; without an opponent they
    /// must be single-move exercises (`movesBudget: 1`).
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

    /// The learner's side: whoever moves first in the start position.
    pub fn learner_side(&self) -> Result<Color, String> {
        Ok(MiniState::parse(&self.start_fen)?.mover())
    }

    fn check_supported(&self) -> Result<(), String> {
        if self.opponent == Opponent::Engine {
            return Err("scenario opponent 'engine' is a deferred seam, not implemented".into());
        }
        match self.rules {
            Rules::Standard => {
                // D1: opponentless standard scenarios are single-move
                // exercises — there is no turn to hand back.
                if self.opponent == Opponent::None && self.moves_budget != Some(1) {
                    return Err(
                        "standard-rules scenarios without an opponent must have movesBudget 1"
                            .into(),
                    );
                }
                if matches!(self.goal, Goal::Survive { .. }) {
                    return Err("goal 'survive' runs under movement rules".into());
                }
                if matches!(self.goal, Goal::EscapeCheck) {
                    let start = engine::parse_fen(&self.start_fen)?;
                    if !start.is_check() {
                        return Err("escape-check scenario must start in check".into());
                    }
                }
            }
            Rules::Movement => {
                if matches!(
                    self.goal,
                    Goal::GiveCheck | Goal::Checkmate | Goal::EscapeCheck
                ) {
                    return Err(
                        "goal requires rules 'standard' — the movement model has no check semantics"
                            .into(),
                    );
                }
                if matches!(self.goal, Goal::Survive { .. }) && self.opponent == Opponent::None {
                    return Err("goal 'survive' needs an opponent to survive".into());
                }
            }
        }
        if let Goal::Survive { moves } = &self.goal {
            if *moves == 0 {
                return Err("survive goal needs at least one move".into());
            }
            if self.moves_budget != Some(*moves) {
                return Err("survive goal requires movesBudget equal to its move count".into());
            }
        }
        Ok(())
    }
}

/// A permissively-parsed scenario position (raw `Setup`, no legality
/// screening). It is the movement model's native state, and the standard
/// path's reader for board goals, ply arithmetic and survive counts —
/// full-rules legality always goes through `engine::parse_fen` instead.
/// En passant is stripped on parse: the movement model has no EP by
/// design, and none of the standard-path reads (occupancy, turn,
/// counters) can observe it. Movement-model FENs round-trip with the
/// fullmove counter as the budget clock (F5): 1 + learner moves used.
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
/// Constraints bind the learner only (D3): on the opponent's turn the
/// whole army moves.
pub fn scenario_legal_moves(scenario: &Scenario, fen: &str) -> Result<Vec<Move>, String> {
    scenario.check_supported()?;
    let learner = scenario.learner_side()?;
    match scenario.rules {
        Rules::Movement => {
            let state = MiniState::parse(fen)?;
            let allowed = (state.mover() == learner)
                .then_some(scenario.allowed.as_ref())
                .flatten();
            Ok(movement_moves(state.board(), state.mover(), allowed))
        }
        Rules::Standard => {
            let pos = engine::parse_fen(fen)?;
            let allowed = (pos.turn() == learner)
                .then_some(scenario.allowed.as_ref())
                .flatten();
            Ok(filter_legal_moves(&pos, allowed))
        }
    }
}

/// Wire-format info for one movement-model move. `all` is the full move
/// list, needed for SAN disambiguation.
fn movement_move_info(board: &Board, mover: Color, all: &[Move], m: &Move) -> MoveInfo {
    MoveInfo {
        uci: m.to_uci(CastlingMode::Standard).to_string(),
        san: movement_san(board, mover, all, m),
        from: m.from().map(|s| s.to_string()),
        to: m.to().to_string(),
        piece: engine::piece_letter(m.role(), mover),
        capture: m.is_capture(),
        castle: false,
    }
}

/// Whose turn it is in `fen` under the scenario's rules model.
fn side_to_move(scenario: &Scenario, fen: &str) -> Result<Color, String> {
    Ok(match scenario.rules {
        Rules::Movement => MiniState::parse(fen)?.mover(),
        Rules::Standard => engine::parse_fen(fen)?.turn(),
    })
}

/// Wire-format move list for a scenario position.
pub fn scenario_move_infos(scenario: &Scenario, fen: &str) -> Result<Vec<MoveInfo>, String> {
    let moves = scenario_legal_moves(scenario, fen)?;
    match scenario.rules {
        Rules::Standard => {
            let pos = engine::parse_fen(fen)?;
            Ok(moves.iter().map(|m| engine::move_info(&pos, m)).collect())
        }
        Rules::Movement => {
            let state = MiniState::parse(fen)?;
            Ok(moves
                .iter()
                .map(|m| movement_move_info(state.board(), state.mover(), &moves, m))
                .collect())
        }
    }
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
/// moves.
///
/// Movement model: with `opponent: none` the mover keeps the turn; with
/// an opponent the turn alternates. The fullmove counter advances only
/// on LEARNER moves — it is the move-budget clock (F5).
///
/// Standard rules: real chess semantics throughout — the turn flips and
/// the counters run honestly; learner moves are derived by ply
/// arithmetic instead (D4).
pub fn scenario_apply(scenario: &Scenario, fen: &str, uci: &str) -> Result<String, String> {
    let candidates = scenario_legal_moves(scenario, fen)?;
    let m = engine::find_move(&candidates, uci)?;

    if scenario.rules == Rules::Standard {
        let pos = engine::parse_fen(fen)?;
        let next = pos
            .play(&m)
            .map_err(|e| format!("could not apply '{uci}': {e}"))?;
        return Ok(engine::to_fen(&next));
    }

    let mut state = MiniState::parse(fen)?;
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
    let learner = scenario.learner_side()?;
    let board = &mut state.setup.board;
    let _moved = board.remove_piece_at(from);
    board.set_piece_at(
        to,
        shakmaty::Piece {
            color: mover,
            role: promotion.unwrap_or(role),
        },
    );

    state.setup.turn = if scenario.opponent == Opponent::None {
        mover // learner keeps the move
    } else {
        !mover // opponent-bearing mini-games alternate
    };
    state.setup.halfmoves = 0;
    if mover == learner {
        let next = state.setup.fullmoves.get().saturating_add(1);
        state.setup.fullmoves = NonZeroU32::new(next).unwrap_or(NonZeroU32::MIN);
    }
    Ok(state.to_fen())
}

/// Piece value for the greedy policy (kings are never capturable).
fn capture_value(role: Role) -> u32 {
    match role {
        Role::Pawn => 1,
        Role::Knight | Role::Bishop => 3,
        Role::Rook => 5,
        Role::Queen => 9,
        Role::King => 0,
    }
}

/// The greedy pick (D3): highest material gain, ties broken by
/// lexicographic UCI, lexicographically first move when nothing hangs.
/// Gain counts the captured piece AND the promotion piece — otherwise a
/// promoting greedy would underpromote to a bishop purely because
/// "…b" sorts before "…q". Deterministic so the verifier can treat the
/// opponent as a function.
pub(crate) fn greedy_pick(moves: &[Move]) -> Option<Move> {
    moves
        .iter()
        .min_by_key(|m| {
            let gain = m.capture().map(capture_value).unwrap_or(0)
                + m.promotion().map(capture_value).unwrap_or(0);
            (
                std::cmp::Reverse(gain),
                m.to_uci(CastlingMode::Standard).to_string(),
            )
        })
        .cloned()
}

/// The opponent's reply and the position after it. `mv` is `None` when
/// the opponent has no legal move; what that MEANS depends on the rules
/// model — movement: the turn passes back to the learner (the returned
/// FEN reflects that) and play continues; standard: the game is already
/// over (mate or stalemate) and the position stands unchanged.
#[derive(Serialize)]
pub struct OpponentReply {
    #[serde(rename = "move")]
    pub mv: Option<MoveInfo>,
    pub fen: String,
}

/// Compute and apply the scenario opponent's deterministic reply.
/// Errors when the scenario has no opponent or it is the learner's turn.
pub fn scenario_opponent_move(scenario: &Scenario, fen: &str) -> Result<OpponentReply, String> {
    scenario.check_supported()?;
    if scenario.opponent != Opponent::Greedy {
        return Err("scenario has no opponent to move".into());
    }
    let learner = scenario.learner_side()?;
    if side_to_move(scenario, fen)? == learner {
        return Err("it is the learner's turn, not the opponent's".into());
    }
    // One derivation: the list greedy_pick chooses from is the list the
    // reply's wire info is built from; scenario_apply then re-validates
    // the pick on the single shared application path.
    let moves = scenario_legal_moves(scenario, fen)?;
    match greedy_pick(&moves) {
        Some(m) => {
            let info = match scenario.rules {
                Rules::Standard => engine::move_info(&engine::parse_fen(fen)?, &m),
                Rules::Movement => {
                    let state = MiniState::parse(fen)?;
                    movement_move_info(state.board(), state.mover(), &moves, &m)
                }
            };
            let next = scenario_apply(scenario, fen, &info.uci)?;
            Ok(OpponentReply {
                mv: Some(info),
                fen: next,
            })
        }
        None => match scenario.rules {
            // Movement model: pass the turn back so the learner is
            // never stuck (there is no stalemate concept to honor).
            Rules::Movement => {
                let mut state = MiniState::parse(fen)?;
                state.setup.turn = learner;
                Ok(OpponentReply {
                    mv: None,
                    fen: state.to_fen(),
                })
            }
            // Standard rules: no legal reply means the game is over
            // (mate or stalemate) — the position stands as-is.
            Rules::Standard => Ok(OpponentReply {
                mv: None,
                fen: fen.to_string(),
            }),
        },
    }
}

/// Failure reasons on the wire. A CONTRACT, not free text: the play
/// surface branches on these for its closing copy, and the TS mirror
/// (`ScenarioFailureReason` in packages/core/src/types.ts) must grow in
/// lockstep with this list.
const REASON_BUDGET_EXHAUSTED: &str = "moves-budget-exhausted";
const REASON_NO_LEGAL_MOVES: &str = "no-legal-moves";
const REASON_PIECE_CAPTURED: &str = "piece-captured";

#[derive(Serialize)]
pub struct ScenarioResult {
    /// "ongoing" | "goal-met" | "failed"
    pub status: String,
    /// One of the REASON_* consts above when status is "failed".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(rename = "movesUsed")]
    pub moves_used: u32,
    /// Remaining budget; absent when the budget is unlimited.
    #[serde(rename = "movesLeft", skip_serializing_if = "Option::is_none")]
    pub moves_left: Option<u32>,
}

/// Board-only goals (capture-all, reach-square) — shared by both rules
/// models. The position-aware goals (check family, survive) are judged
/// inside `scenario_result`, which has the context they need.
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
        Goal::GiveCheck | Goal::Checkmate | Goal::EscapeCheck | Goal::Survive { .. } => Err(
            "goal is judged by scenario_result, not on the board alone".into(),
        ),
    }
}

/// Absolute ply index of a setup: 0 at move one with White to move.
fn ply_index(setup: &Setup) -> i64 {
    let black_to_move = i64::from(setup.turn == Color::Black);
    2 * (i64::from(setup.fullmoves.get()) - 1) + black_to_move
}

/// Evaluate a scenario position: goal met, budget exhausted, stuck, or ongoing.
pub fn scenario_result(scenario: &Scenario, fen: &str) -> Result<ScenarioResult, String> {
    scenario.check_supported()?;
    let state = MiniState::parse(fen)?;
    let start = MiniState::parse(&scenario.start_fen)?;
    let learner = start.mover();

    // Learner moves used. Movement model: the fullmove counter is the
    // budget clock, bumped per learner move (F5). Standard rules: honest
    // ply arithmetic (D4) — the learner moves first, so their move count
    // is the ceiling of elapsed plies / 2.
    let used = match scenario.rules {
        Rules::Movement => state
            .setup
            .fullmoves
            .get()
            .saturating_sub(start.setup.fullmoves.get()),
        Rules::Standard => {
            let elapsed = ply_index(&state.setup) - ply_index(&start.setup);
            // Integer division would quietly round small negatives to 0
            // moves used — reject a position from before its scenario
            // outright instead of scoring it.
            if elapsed < 0 {
                return Err("position predates its scenario's start".into());
            }
            u32::try_from((elapsed + 1) / 2).map_err(|_| "moves used overflows".to_string())?
        }
    };
    let left = scenario.moves_budget.map(|b| b.saturating_sub(used));

    let met = match &scenario.goal {
        Goal::CaptureAll { .. } | Goal::ReachSquare { .. } => {
            goal_met(&scenario.goal, state.board())?
        }
        // The check family: judged on the real position, only once the
        // learner has moved (the turn has passed to the enemy).
        Goal::GiveCheck => {
            let pos = engine::parse_fen(fen)?;
            pos.turn() != learner && pos.is_check()
        }
        Goal::Checkmate => {
            let pos = engine::parse_fen(fen)?;
            pos.turn() != learner && pos.is_checkmate()
        }
        Goal::EscapeCheck => {
            let pos = engine::parse_fen(fen)?;
            // Any completed legal move escaped; legality is the proof.
            pos.turn() != learner
        }
        Goal::Survive { moves } => {
            let start_count = start.board().by_color(learner).count();
            let now_count = state.board().by_color(learner).count();
            if now_count < start_count {
                return Ok(ScenarioResult {
                    status: "failed".into(),
                    reason: Some(REASON_PIECE_CAPTURED.into()),
                    moves_used: used,
                    moves_left: left,
                });
            }
            // Met only once the opponent has answered the final move —
            // the last move has to be safe too.
            used >= *moves && state.mover() == learner
        }
    };
    if met {
        return Ok(ScenarioResult {
            status: "goal-met".into(),
            reason: None,
            moves_used: used,
            moves_left: left,
        });
    }
    // Budget spent: for opponent-bearing scenarios the learner's final
    // move may still be awaiting the opponent's answer (survive judges
    // after the reply), so "exhausted" only fails once it is the
    // learner's turn again.
    if left == Some(0) && (scenario.opponent == Opponent::None || state.mover() == learner) {
        return Ok(ScenarioResult {
            status: "failed".into(),
            reason: Some(REASON_BUDGET_EXHAUSTED.into()),
            moves_used: used,
            moves_left: left,
        });
    }
    // Stuck is terminal for the LEARNER, and for standard rules (where
    // no legal moves genuinely means mate or stalemate). A stuck
    // movement-model OPPONENT is not the end: the result stays ongoing
    // so orchestrators reach scenario_opponent_move, which passes the
    // turn back and play continues — a trapped opponent is maximum
    // safety, not a failure.
    let opponent_may_pass = scenario.rules == Rules::Movement
        && scenario.opponent != Opponent::None
        && state.mover() != learner;
    if !opponent_may_pass && scenario_legal_moves(scenario, fen)?.is_empty() {
        return Ok(ScenarioResult {
            status: "failed".into(),
            reason: Some(REASON_NO_LEGAL_MOVES.into()),
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

    // ---- Band 2: standard-rules scenarios (F2 opened; decisions D1–D4)
    //      and the greedy opponent (D3). P2 shape: every new mechanic is
    //      played to its result in a test before content exists. ----

    /// Black Ka8, white Kb6 + Qc1: c1c8 mates, c1c7 stalemates — one
    /// position carries both the mate lesson and the stalemate alarm.
    fn mate_in_one() -> Scenario {
        Scenario::from_json(
            r#"{
              "id": "test-mate-in-one",
              "startFEN": "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1",
              "goal": { "type": "checkmate" },
              "rules": "standard",
              "movesBudget": 1
            }"#,
        )
        .unwrap()
    }

    #[test]
    fn mate_in_one_is_detected() {
        let s = mate_in_one();
        assert_eq!(scenario_result(&s, &s.start_fen).unwrap().status, "ongoing");
        let fen = scenario_apply(&s, &s.start_fen, "c1c8").unwrap();
        let r = scenario_result(&s, &fen).unwrap();
        assert_eq!(r.status, "goal-met");
        assert_eq!(r.moves_used, 1, "standard ply arithmetic (D4)");
    }

    #[test]
    fn stalemate_is_not_checkmate_and_fails_the_exercise() {
        let s = mate_in_one();
        let fen = scenario_apply(&s, &s.start_fen, "c1c7").unwrap();
        let r = scenario_result(&s, &fen).unwrap();
        assert_eq!(r.status, "failed");
        assert_eq!(r.reason.as_deref(), Some("moves-budget-exhausted"));
        // The play surface narrates the near-miss from the standard
        // result — pin that the core reports it as a stalemate draw.
        let g = engine::game_result(&engine::parse_fen(&fen).unwrap());
        assert_eq!(g.status, "draw");
        assert_eq!(g.reason.as_deref(), Some("stalemate"));
    }

    #[test]
    fn give_check_goal_is_playable() {
        let s = Scenario::from_json(
            r#"{
              "id": "test-give-check",
              "startFEN": "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
              "allowed": { "pieces": ["R"] },
              "goal": { "type": "give-check" },
              "rules": "standard",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        // Not met at the start position (the learner has not moved).
        assert_eq!(scenario_result(&s, &s.start_fen).unwrap().status, "ongoing");
        let checking = scenario_apply(&s, &s.start_fen, "a1a8").unwrap();
        assert_eq!(scenario_result(&s, &checking).unwrap().status, "goal-met");
        let quiet = scenario_apply(&s, &s.start_fen, "a1a2").unwrap();
        let r = scenario_result(&s, &quiet).unwrap();
        assert_eq!(r.status, "failed");
        assert_eq!(r.reason.as_deref(), Some("moves-budget-exhausted"));
    }

    #[test]
    fn escape_check_offers_exactly_the_legal_escapes() {
        // Black rook e8 checks Ke1: the four king steps off the e-file
        // are the only legal moves — the doors ARE the move list.
        let s = Scenario::from_json(
            r#"{
              "id": "test-escape-check",
              "startFEN": "4r2k/8/8/8/8/8/8/4K3 w - - 0 1",
              "goal": { "type": "escape-check" },
              "rules": "standard",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let moves = scenario_legal_moves(&s, &s.start_fen).unwrap();
        assert_eq!(moves.len(), 4, "d1, d2, f1, f2 — e2 stays covered");
        let fen = scenario_apply(&s, &s.start_fen, "e1d2").unwrap();
        assert_eq!(scenario_result(&s, &fen).unwrap().status, "goal-met");
    }

    #[test]
    fn escape_check_requires_a_checked_start() {
        let s = Scenario::from_json(
            r#"{
              "id": "test-not-in-check",
              "startFEN": "4r2k/8/8/8/8/8/8/5K2 w - - 0 1",
              "goal": { "type": "escape-check" },
              "rules": "standard",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let err = scenario_legal_moves(&s, &s.start_fen).unwrap_err();
        assert!(err.contains("must start in check"), "{err}");
    }

    #[test]
    fn opponentless_standard_scenarios_are_single_move() {
        // D1: no opponent to hand the turn to — multi-move is refused.
        let s = Scenario::from_json(
            r#"{
              "id": "test-d1",
              "startFEN": "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1",
              "goal": { "type": "checkmate" },
              "rules": "standard",
              "movesBudget": 2
            }"#,
        )
        .unwrap();
        let err = scenario_legal_moves(&s, &s.start_fen).unwrap_err();
        assert!(err.contains("movesBudget 1"), "{err}");
    }

    #[test]
    fn check_goals_are_refused_under_movement_rules() {
        let s = Scenario::from_json(
            r#"{
              "id": "test-wrong-model",
              "startFEN": "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
              "goal": { "type": "give-check" },
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let err = scenario_legal_moves(&s, &s.start_fen).unwrap_err();
        assert!(err.contains("standard"), "{err}");
    }

    #[test]
    fn castling_reaches_the_reach_square_goal() {
        let s = Scenario::from_json(
            r#"{
              "id": "test-castle",
              "startFEN": "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
              "goal": { "type": "reach-square", "square": "g1", "piece": "K" },
              "rules": "standard",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let ucis: Vec<String> = scenario_legal_moves(&s, &s.start_fen)
            .unwrap()
            .iter()
            .map(|m| m.to_uci(CastlingMode::Standard).to_string())
            .collect();
        assert!(ucis.contains(&"e1g1".to_string()), "castling offered");
        // The wire reports the KING's landing square — the square the
        // learner clicks and the D2 reach-square goal names — not
        // shakmaty's internal rook-square encoding.
        let infos = scenario_move_infos(&s, &s.start_fen).unwrap();
        let castle = infos.iter().find(|i| i.uci == "e1g1").unwrap();
        assert!(castle.castle);
        assert_eq!(castle.from.as_deref(), Some("e1"));
        assert_eq!(castle.to, "g1");
        let fen = scenario_apply(&s, &s.start_fen, "e1g1").unwrap();
        assert_eq!(scenario_result(&s, &fen).unwrap().status, "goal-met");
    }

    #[test]
    fn castling_constraint_removes_the_castle() {
        let s = Scenario::from_json(
            r#"{
              "id": "test-no-castle",
              "startFEN": "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
              "allowed": { "castling": false },
              "goal": { "type": "give-check" },
              "rules": "standard",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let ucis: Vec<String> = scenario_legal_moves(&s, &s.start_fen)
            .unwrap()
            .iter()
            .map(|m| m.to_uci(CastlingMode::Standard).to_string())
            .collect();
        assert!(!ucis.contains(&"e1g1".to_string()));
    }

    #[test]
    fn pinned_piece_cannot_move_under_standard() {
        // Re8 pins Ne2 against Ke1: with only the knight allowed, the
        // move list is empty — the pin is a fact of the move list.
        let s = Scenario::from_json(
            r#"{
              "id": "test-pin",
              "startFEN": "4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1",
              "allowed": { "pieces": ["N"] },
              "goal": { "type": "give-check" },
              "rules": "standard",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        assert!(scenario_legal_moves(&s, &s.start_fen).unwrap().is_empty());
        let r = scenario_result(&s, &s.start_fen).unwrap();
        assert_eq!(r.status, "failed");
        assert_eq!(r.reason.as_deref(), Some("no-legal-moves"));
    }

    /// White knight vs. black rook: dodge Pip for two moves.
    fn survive_two() -> Scenario {
        Scenario::from_json(
            r#"{
              "id": "test-survive",
              "startFEN": "r7/8/8/8/8/2N5/8/8 w - - 0 1",
              "allowed": { "pieces": ["N"] },
              "goal": { "type": "survive", "moves": 2 },
              "opponent": "greedy",
              "movesBudget": 2
            }"#,
        )
        .unwrap()
    }

    #[test]
    fn survive_scenario_is_playable() {
        let s = survive_two();
        // Move 1: knight steps off the rook's lines.
        let fen = scenario_apply(&s, &s.start_fen, "c3e2").unwrap();
        // Constraints bind the learner only (D3): the rook replies even
        // though "R" is not in allowed.pieces. No capture exists, so the
        // reply is the lexicographically first rook move.
        let reply = scenario_opponent_move(&s, &fen).unwrap();
        assert_eq!(reply.mv.as_ref().unwrap().uci, "a8a1");
        let fen = reply.fen;
        let mid = scenario_result(&s, &fen).unwrap();
        assert_eq!(mid.status, "ongoing");
        assert_eq!(mid.moves_used, 1);
        // Move 2: step back — still off the rook's new lines.
        let fen = scenario_apply(&s, &fen, "e2c3").unwrap();
        // Not judged yet: Pip still gets to answer the final move.
        assert_eq!(scenario_result(&s, &fen).unwrap().status, "ongoing");
        let reply = scenario_opponent_move(&s, &fen).unwrap();
        assert_eq!(reply.mv.as_ref().unwrap().uci, "a1a2");
        let r = scenario_result(&s, &reply.fen).unwrap();
        assert_eq!(r.status, "goal-met");
        assert_eq!(r.moves_used, 2);
    }

    #[test]
    fn survive_scenario_punishes_a_hung_piece() {
        let s = survive_two();
        // The knight steps onto the rook's file — Pip eats it.
        let fen = scenario_apply(&s, &s.start_fen, "c3a4").unwrap();
        let reply = scenario_opponent_move(&s, &fen).unwrap();
        assert_eq!(reply.mv.as_ref().unwrap().uci, "a8a4");
        let r = scenario_result(&s, &reply.fen).unwrap();
        assert_eq!(r.status, "failed");
        assert_eq!(r.reason.as_deref(), Some("piece-captured"));
    }

    #[test]
    fn greedy_takes_the_biggest_prize() {
        // Black rook can eat a queen (9) or a rook (5): value wins.
        let s = Scenario::from_json(
            r#"{
              "id": "test-greedy-value",
              "startFEN": "3r3R/8/8/8/3Q4/8/8/N7 w - - 0 1",
              "allowed": { "pieces": ["N"] },
              "goal": { "type": "survive", "moves": 1 },
              "opponent": "greedy",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let black_to_move = "3r3R/8/8/8/3Q4/8/8/N7 b - - 0 1";
        let reply = scenario_opponent_move(&s, black_to_move).unwrap();
        assert_eq!(reply.mv.as_ref().unwrap().uci, "d8d4");
    }

    #[test]
    fn greedy_tiebreak_is_lexicographic() {
        // Two pawns hang (equal value): the lexicographically smaller
        // UCI wins — determinism the verifier can rely on.
        let s = Scenario::from_json(
            r#"{
              "id": "test-greedy-tie",
              "startFEN": "8/8/8/1P1r4/8/8/8/3P3N w - - 0 1",
              "allowed": { "pieces": ["N"] },
              "goal": { "type": "survive", "moves": 1 },
              "opponent": "greedy",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let black_to_move = "8/8/8/1P1r4/8/8/8/3P3N b - - 0 1";
        let reply = scenario_opponent_move(&s, black_to_move).unwrap();
        assert_eq!(reply.mv.as_ref().unwrap().uci, "d5b5");
    }

    #[test]
    fn survive_goal_is_validated() {
        // Needs an opponent…
        let no_opponent = Scenario::from_json(
            r#"{
              "id": "t1",
              "startFEN": "r7/8/8/8/8/2N5/8/8 w - - 0 1",
              "goal": { "type": "survive", "moves": 2 },
              "movesBudget": 2
            }"#,
        )
        .unwrap();
        assert!(scenario_legal_moves(&no_opponent, &no_opponent.start_fen)
            .unwrap_err()
            .contains("needs an opponent"));
        // …and a budget equal to its move count.
        let wrong_budget = Scenario::from_json(
            r#"{
              "id": "t2",
              "startFEN": "r7/8/8/8/8/2N5/8/8 w - - 0 1",
              "goal": { "type": "survive", "moves": 2 },
              "opponent": "greedy",
              "movesBudget": 3
            }"#,
        )
        .unwrap();
        assert!(scenario_legal_moves(&wrong_budget, &wrong_budget.start_fen)
            .unwrap_err()
            .contains("movesBudget equal"));
    }

    #[test]
    fn trapped_opponent_passes_the_turn_and_play_continues() {
        // The enemy rook is boxed in by white kings (uncapturable scenery
        // in the movement model): it has ZERO moves. A trapped opponent
        // is maximum safety — the learner must never be failed for it.
        let s = Scenario::from_json(
            r#"{
              "id": "test-trapped-opponent",
              "startFEN": "8/8/8/8/8/5N2/K7/rK6 w - - 0 1",
              "allowed": { "pieces": ["N"] },
              "goal": { "type": "survive", "moves": 1 },
              "opponent": "greedy",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let fen = scenario_apply(&s, &s.start_fen, "f3e5").unwrap();
        // Not failed: the stuck side is the OPPONENT, and it may pass.
        assert_eq!(scenario_result(&s, &fen).unwrap().status, "ongoing");
        let reply = scenario_opponent_move(&s, &fen).unwrap();
        assert!(reply.mv.is_none(), "no legal reply — the turn passes back");
        let r = scenario_result(&s, &reply.fen).unwrap();
        assert_eq!(r.status, "goal-met");
        assert_eq!(r.moves_used, 1);
    }

    #[test]
    fn stuck_learner_still_fails() {
        // The guard is one-sided: a LEARNER with no moves is still a
        // terminal result, opponent or not. Knights jump, so the only
        // way to stick one is friendly pieces on all eight landing
        // squares — and the constraint keeps those pawns unmovable.
        let s = Scenario::from_json(
            r#"{
              "id": "test-stuck-learner",
              "startFEN": "r6k/8/2P1P3/1P3P2/3N4/1P3P2/2P1P3/8 w - - 0 1",
              "allowed": { "pieces": ["N"] },
              "goal": { "type": "survive", "moves": 2 },
              "opponent": "greedy",
              "movesBudget": 2
            }"#,
        )
        .unwrap();
        let r = scenario_result(&s, &s.start_fen).unwrap();
        assert_eq!(r.status, "failed");
        assert_eq!(r.reason.as_deref(), Some("no-legal-moves"));
    }

    #[test]
    fn mate_in_two_vs_greedy_is_playable() {
        // The one D1-legal multi-move standard shape: opponent-bearing.
        // Pins the composed path — ply arithmetic across folded replies,
        // the budget-exhaustion deferral, checkmate judged mid-sequence.
        let s = Scenario::from_json(
            r#"{
              "id": "test-mate-in-two",
              "startFEN": "k7/8/1K6/8/8/8/8/7R w - - 0 1",
              "goal": { "type": "checkmate" },
              "rules": "standard",
              "opponent": "greedy",
              "movesBudget": 2
            }"#,
        )
        .unwrap();
        let fen = scenario_apply(&s, &s.start_fen, "h1h7").unwrap();
        let mid = scenario_result(&s, &fen).unwrap();
        assert_eq!(mid.status, "ongoing");
        assert_eq!(mid.moves_used, 1, "learner moves only (D4 ply arithmetic)");
        // Black's ONLY legal move — deterministic without even needing greed.
        let reply = scenario_opponent_move(&s, &fen).unwrap();
        assert_eq!(reply.mv.as_ref().unwrap().uci, "a8b8");
        let fen = scenario_apply(&s, &reply.fen, "h7h8").unwrap();
        let end = scenario_result(&s, &fen).unwrap();
        assert_eq!(end.status, "goal-met");
        assert_eq!(end.moves_used, 2);
    }

    #[test]
    fn greedy_never_underpromotes() {
        // Promotion counts as material gain in the greedy key. The
        // movement model auto-queens, so the exposure is the standard
        // path, where all four promotions exist and "a1b" sorts before
        // "a1q" — without the gain term the greedy would pick a bishop.
        let pos = engine::parse_fen("7k/8/8/8/8/8/p7/7K b - - 0 1").unwrap();
        let pick = greedy_pick(&engine::legal_moves(&pos)).unwrap();
        assert_eq!(
            pick.to_uci(CastlingMode::Standard).to_string(),
            "a2a1q",
            "gain 9 beats the b/n/r spellings"
        );
    }

    // ---- Per-piece movement-vs-standard equivalence (F1 discipline) ----
    //
    // Every piece that a curriculum node teaches gets its movement-model
    // move set compared against full-rules shakmaty on an equivalent
    // position (kings parked off every line of the piece under test).
    // Positions include a blocked line (own piece) and a capture (enemy
    // piece) wherever the geometry allows. Intentional divergences of the
    // movement model (no check semantics, auto-queen promotion, no en
    // passant) get their own tests below so the divergence is documented,
    // not accidental.

    fn mini_ucis(scenario_json: &str) -> std::collections::BTreeSet<String> {
        let s = Scenario::from_json(scenario_json).unwrap();
        scenario_legal_moves(&s, &s.start_fen)
            .unwrap()
            .iter()
            .map(|m| m.to_uci(CastlingMode::Standard).to_string())
            .collect()
    }

    fn standard_ucis(fen: &str, piece: &str) -> std::collections::BTreeSet<String> {
        let full = engine::parse_fen(fen).unwrap();
        filter_legal_moves(
            &full,
            Some(&Constraints {
                pieces: Some(vec![piece.into()]),
                moves: None,
                castling: None,
            }),
        )
        .iter()
        .map(|m| m.to_uci(CastlingMode::Standard).to_string())
        .collect()
    }

    #[test]
    fn movement_matches_real_bishop_geometry() {
        // Bishop e4: own pawn c6 blocks the NW diagonal beyond d5; enemy
        // pawn g6 is capturable on the NE diagonal. Kings parked off all
        // four of e4's diagonals.
        let mini = mini_ucis(
            r#"{
              "id": "bishop-geometry",
              "startFEN": "8/8/2P3p1/8/4B3/8/8/8 w - - 0 1",
              "allowed": { "pieces": ["B"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        );
        let reference = standard_ucis("6K1/8/2P3p1/8/4B3/8/8/k7 w - - 0 1", "B");
        assert_eq!(mini, reference);
    }

    #[test]
    fn movement_matches_real_knight_geometry() {
        // Knight d4 ringed by own pawns (a rook would be stuck): the ring
        // squares are not knight destinations, the jump goes over them,
        // and the enemy pawn f5 is capturable. Kings parked far away.
        let mini = mini_ucis(
            r#"{
              "id": "knight-geometry",
              "startFEN": "8/8/8/2PPPp2/2PNP3/2PPP3/8/8 w - - 0 1",
              "allowed": { "pieces": ["N"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        );
        let reference = standard_ucis("7K/8/8/2PPPp2/2PNP3/2PPP3/8/k7 w - - 0 1", "N");
        assert_eq!(mini, reference);
    }

    #[test]
    fn movement_matches_real_queen_geometry() {
        // Queen d4: own pawn d6 blocks the file beyond d5; enemy pawn g4
        // is capturable along the rank and blocks h4. Kings parked off
        // every rank/file/diagonal through d4.
        let mini = mini_ucis(
            r#"{
              "id": "queen-geometry",
              "startFEN": "8/8/3P4/8/3Q2p1/8/8/8 w - - 0 1",
              "allowed": { "pieces": ["Q"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        );
        let reference = standard_ucis("k7/8/3P4/8/3Q2p1/8/7K/8 w - - 0 1", "Q");
        assert_eq!(mini, reference);
    }

    #[test]
    fn movement_matches_real_king_geometry() {
        // King d4: own pawn d5 blocks one step; enemy pawn c3 is
        // capturable and undefended, and attacks only b2/d2 — no square
        // of the king's ring — so standard check-filtering removes
        // nothing and the two models must agree exactly.
        let mini = mini_ucis(
            r#"{
              "id": "king-geometry",
              "startFEN": "8/8/8/3P4/3K4/2p5/8/8 w - - 0 1",
              "allowed": { "pieces": ["K"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        );
        let reference = standard_ucis("7k/8/8/3P4/3K4/2p5/8/8 w - - 0 1", "K");
        assert_eq!(mini, reference);
    }

    #[test]
    fn king_movement_model_omits_check_semantics_by_design() {
        // The honest pre-check model: a black rook sweeps the e-file, and
        // the movement model still lets the king step onto e5 — check
        // does not exist yet for the learner. Standard rules forbid it.
        // This divergence is the whole reason the movement model exists.
        let mini = mini_ucis(
            r#"{
              "id": "king-no-check",
              "startFEN": "8/8/4r3/8/3K4/8/8/8 w - - 0 1",
              "allowed": { "pieces": ["K"] },
              "goal": { "type": "capture-all", "targets": "r" },
              "opponent": "none"
            }"#,
        );
        let reference = standard_ucis("7k/8/4r3/8/3K4/8/8/8 w - - 0 1", "K");
        assert!(mini.contains("d4e5"), "movement model allows stepping onto an attacked square");
        assert!(!reference.contains("d4e5"), "standard rules forbid it");
    }

    #[test]
    fn movement_matches_real_pawn_pushes() {
        // From the start rank: single and double push.
        let free = mini_ucis(
            r#"{
              "id": "pawn-push-free",
              "startFEN": "8/8/8/8/8/8/4P3/8 w - - 0 1",
              "allowed": { "pieces": ["P"] },
              "goal": { "type": "reach-square", "square": "e4", "piece": "P" },
              "opponent": "none"
            }"#,
        );
        assert_eq!(free, standard_ucis("7k/8/8/8/8/8/4P3/7K w - - 0 1", "P"));

        // A piece two squares ahead kills only the double push.
        let double_blocked = mini_ucis(
            r#"{
              "id": "pawn-push-double-blocked",
              "startFEN": "8/8/8/8/4p3/8/4P3/8 w - - 0 1",
              "allowed": { "pieces": ["P"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        );
        assert_eq!(
            double_blocked,
            standard_ucis("7k/8/8/8/4p3/8/4P3/7K w - - 0 1", "P"),
        );

        // A piece directly ahead kills every push — and is NOT capturable
        // forward: no moves at all.
        let fully_blocked = mini_ucis(
            r#"{
              "id": "pawn-push-blocked",
              "startFEN": "8/8/8/8/8/4p3/4P3/8 w - - 0 1",
              "allowed": { "pieces": ["P"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        );
        assert!(fully_blocked.is_empty());
        assert_eq!(
            fully_blocked,
            standard_ucis("7k/8/8/8/8/4p3/4P3/7K w - - 0 1", "P"),
        );
    }

    #[test]
    fn movement_matches_real_pawn_captures() {
        // Enemy pawns on both capture diagonals, an enemy bishop dead
        // ahead blocking the push: captures only, exactly like standard.
        let mini = mini_ucis(
            r#"{
              "id": "pawn-captures",
              "startFEN": "8/8/8/3pbp2/4P3/8/8/8 w - - 0 1",
              "allowed": { "pieces": ["P"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        );
        let reference = standard_ucis("7k/8/8/3pbp2/4P3/8/8/7K w - - 0 1", "P");
        assert_eq!(mini, reference);
        assert!(mini.contains("e4d5") && mini.contains("e4f5") && !mini.contains("e4e5"));
    }

    #[test]
    fn movement_matches_real_black_pawn_direction() {
        // Black to move: pawns march DOWN the board. Same comparison,
        // mirrored side — direction asymmetry is pawn-specific risk.
        let mini = mini_ucis(
            r#"{
              "id": "pawn-black",
              "startFEN": "8/4p3/8/8/8/8/8/8 b - - 0 1",
              "allowed": { "pieces": ["P"] },
              "goal": { "type": "reach-square", "square": "e5", "piece": "p" },
              "opponent": "none"
            }"#,
        );
        assert_eq!(mini, standard_ucis("7k/4p3/8/8/8/8/8/7K b - - 0 1", "P"));
    }

    #[test]
    fn pawn_promotion_auto_queens_by_design() {
        // Standard chess offers four promotion pieces; the movement model
        // deliberately offers exactly one — the queen — because promotion
        // choice is not a Basics concept. Divergence documented here.
        let s = Scenario::from_json(
            r#"{
              "id": "promotion",
              "startFEN": "8/4P3/8/8/8/8/8/8 w - - 0 1",
              "allowed": { "pieces": ["P"] },
              "goal": { "type": "reach-square", "square": "e8", "piece": "Q" },
              "opponent": "none"
            }"#,
        )
        .unwrap();
        let mini: Vec<String> = scenario_legal_moves(&s, &s.start_fen)
            .unwrap()
            .iter()
            .map(|m| m.to_uci(CastlingMode::Standard).to_string())
            .collect();
        assert_eq!(mini, vec!["e7e8q"]);

        let reference = standard_ucis("7k/4P3/8/8/8/8/8/7K w - - 0 1", "P");
        assert_eq!(reference.len(), 4, "standard offers q/r/b/n");

        // Applying the promotion really produces a queen on e8.
        let fen = scenario_apply(&s, &s.start_fen, "e7e8q").unwrap();
        assert!(fen.starts_with("4Q3/"), "expected a white queen on e8, got {fen}");
        assert_eq!(scenario_result(&s, &fen).unwrap().status, "goal-met");
    }

    #[test]
    fn en_passant_is_absent_by_design() {
        // Standard rules would allow exd6 en passant here; the movement
        // model strips the ep square on parse — en passant is not a
        // Basics concept and never appears in a mini-game.
        let mini = mini_ucis(
            r#"{
              "id": "no-ep",
              "startFEN": "8/8/8/3pP3/8/8/8/8 w - d6 0 1",
              "allowed": { "pieces": ["P"] },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none"
            }"#,
        );
        assert!(!mini.contains("e5d6"), "no en passant in the movement model");
        let reference = standard_ucis("7k/8/8/3pP3/8/8/8/7K w - d6 0 1", "P");
        assert!(reference.contains("e5d6"), "standard chess has it");
    }

    // ---- New Day 2–7 mechanics, playable end to end (P2 shape) --------

    #[test]
    fn promotion_race_is_playable() {
        // Day 5 mechanic: march to the last rank, transform, goal checks
        // for the QUEEN the pawn became.
        let s = Scenario::from_json(
            r#"{
              "id": "promotion-race",
              "startFEN": "8/8/8/1P6/8/8/8/8 w - - 0 1",
              "allowed": { "pieces": ["P"], "moves": "pawn-march", "castling": false },
              "goal": { "type": "reach-square", "square": "b8", "piece": "Q" },
              "opponent": "none",
              "movesBudget": 3
            }"#,
        )
        .unwrap();
        let mut fen = s.start_fen.clone();
        for uci in ["b5b6", "b6b7", "b7b8q"] {
            assert_eq!(scenario_result(&s, &fen).unwrap().status, "ongoing");
            fen = scenario_apply(&s, &fen, uci).unwrap();
        }
        let r = scenario_result(&s, &fen).unwrap();
        assert_eq!(r.status, "goal-met");
        assert_eq!(r.moves_used, 3);
    }

    #[test]
    fn value_pick_rewards_the_bigger_prize() {
        // Day 7 mechanic: one move in the budget, two possible captures;
        // only taking the piece named in `targets` meets the goal — the
        // decoy spends the budget and fails.
        let json = r#"{
          "id": "value-pick",
          "startFEN": "3n4/8/8/8/3R3p/8/8/8 w - - 0 1",
          "allowed": { "pieces": ["R"], "moves": "rook-lines", "castling": false },
          "goal": { "type": "capture-all", "targets": "n" },
          "opponent": "none",
          "movesBudget": 1
        }"#;
        let s = Scenario::from_json(json).unwrap();

        let right = scenario_apply(&s, &s.start_fen, "d4d8").unwrap();
        assert_eq!(scenario_result(&s, &right).unwrap().status, "goal-met");

        let wrong = scenario_apply(&s, &s.start_fen, "d4h4").unwrap();
        let r = scenario_result(&s, &wrong).unwrap();
        assert_eq!(r.status, "failed");
        assert_eq!(r.reason.as_deref(), Some("moves-budget-exhausted"));
    }

    #[test]
    fn whole_army_gobble_is_playable() {
        // Day 7 mechanic: two allowed pieces share one goal; the budget
        // is tight enough that both must work.
        let s = Scenario::from_json(
            r#"{
              "id": "army",
              "startFEN": "8/8/1p2p3/8/5p2/8/8/2B1R3 w - - 0 1",
              "allowed": { "pieces": ["R", "B"], "moves": "all", "castling": false },
              "goal": { "type": "capture-all", "targets": "p" },
              "opponent": "none",
              "movesBudget": 3
            }"#,
        )
        .unwrap();
        let mut fen = s.start_fen.clone();
        for uci in ["e1e6", "e6b6", "c1f4"] {
            fen = scenario_apply(&s, &fen, uci).unwrap();
        }
        assert_eq!(scenario_result(&s, &fen).unwrap().status, "goal-met");
    }

    #[test]
    fn turn_stays_with_the_learner() {
        let s = gobble();
        let fen = scenario_apply(&s, &s.start_fen, "a1a8").unwrap();
        assert!(fen.contains(" w "), "turn must stay white, got {fen}");
        assert!(!scenario_legal_moves(&s, &fen).unwrap().is_empty());
    }

    #[test]
    fn standard_seam_is_open_but_d1_validated() {
        // The `rules: "standard"` seam is open (band 2). What replaced
        // the blanket rejection is D1 validation: opponentless standard
        // scenarios must be single-move — a missing budget is refused
        // just like a budget of 2 (`opponentless_standard_scenarios_are_
        // single_move` covers that case).
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
        let err = scenario_legal_moves(&s, &s.start_fen).unwrap_err();
        assert!(err.contains("movesBudget 1"), "{err}");
    }

    #[test]
    fn engine_opponent_is_still_a_deferred_seam() {
        // D3 shipped `greedy`; the Maia-style `engine` upgrade stays gated.
        let s = Scenario::from_json(
            r#"{
              "id": "eng",
              "startFEN": "r7/8/8/8/8/2N5/8/8 w - - 0 1",
              "goal": { "type": "survive", "moves": 1 },
              "opponent": "engine",
              "movesBudget": 1
            }"#,
        )
        .unwrap();
        let err = scenario_legal_moves(&s, &s.start_fen).unwrap_err();
        assert!(err.contains("deferred seam"), "{err}");
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
