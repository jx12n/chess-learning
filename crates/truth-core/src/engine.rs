//! Primitive chess truth: parsing, legality, application, results.
//!
//! Everything here delegates to `shakmaty` — move generation is never
//! hand-rolled. This module knows nothing about scenarios or pedagogy;
//! see `scenario.rs` for the constraint layer.

use serde::Serialize;
use shakmaty::{
    fen::Fen,
    san::SanPlus,
    uci::UciMove,
    CastlingMode, Chess, Color, EnPassantMode, Move, Position, Role, Square,
};

/// Parse a FEN into a standard-chess position (strict validation).
/// Mini-game positions (possibly kingless) never go through here — they
/// live in the constraint layer's movement model; see `scenario.rs`.
pub fn parse_fen(fen: &str) -> Result<Chess, String> {
    let parsed: Fen = fen
        .trim()
        .parse()
        .map_err(|e| format!("invalid FEN '{fen}': {e}"))?;
    parsed
        .into_position(CastlingMode::Standard)
        .map_err(|e| format!("illegal position '{fen}': {e}"))
}

pub fn to_fen(pos: &Chess) -> String {
    Fen::from_position(pos.clone(), EnPassantMode::Legal).to_string()
}

/// Wire representation of a move. `uci` is the canonical identifier used
/// across the whole system; the rest is presentation metadata.
#[derive(Serialize, Clone)]
pub struct MoveInfo {
    pub uci: String,
    pub san: String,
    pub from: Option<String>,
    pub to: String,
    /// Moving piece as a FEN letter (case = color), e.g. "R" or "p".
    pub piece: String,
    pub capture: bool,
    pub castle: bool,
}

pub fn piece_letter(role: Role, color: Color) -> String {
    let c = role.upper_char();
    match color {
        Color::White => c.to_string(),
        Color::Black => c.to_ascii_lowercase().to_string(),
    }
}

pub fn move_info(pos: &Chess, m: &Move) -> MoveInfo {
    MoveInfo {
        uci: m.to_uci(CastlingMode::Standard).to_string(),
        san: SanPlus::from_move(pos.clone(), m).to_string(),
        from: m.from().map(|s| s.to_string()),
        to: m.to().to_string(),
        piece: piece_letter(m.role(), pos.turn()),
        capture: m.is_capture(),
        castle: m.is_castle(),
    }
}

pub fn legal_moves(pos: &Chess) -> Vec<Move> {
    pos.legal_moves().into_iter().collect()
}

/// Find the legal move matching a UCI string among `candidates`.
pub fn find_move(candidates: &[Move], uci: &str) -> Result<Move, String> {
    let parsed: UciMove = uci
        .trim()
        .parse()
        .map_err(|e| format!("invalid UCI move '{uci}': {e}"))?;
    candidates
        .iter()
        .find(|m| m.to_uci(CastlingMode::Standard) == parsed)
        .cloned()
        .ok_or_else(|| format!("illegal move '{uci}' in this position"))
}

#[derive(Serialize)]
pub struct GameResult {
    /// "ongoing" | "win" | "draw"
    pub status: String,
    /// "white" | "black" when status is "win".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub winner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Side to move is in check.
    pub check: bool,
}

pub fn game_result(pos: &Chess) -> GameResult {
    let check = pos.is_check();
    if pos.is_checkmate() {
        return GameResult {
            status: "win".into(),
            winner: Some(color_name(!pos.turn())),
            reason: Some("checkmate".into()),
            check,
        };
    }
    if pos.is_stalemate() {
        return GameResult {
            status: "draw".into(),
            winner: None,
            reason: Some("stalemate".into()),
            check,
        };
    }
    if pos.is_insufficient_material() {
        return GameResult {
            status: "draw".into(),
            winner: None,
            reason: Some("insufficient-material".into()),
            check,
        };
    }
    GameResult {
        status: "ongoing".into(),
        winner: None,
        reason: None,
        check,
    }
}

pub fn color_name(color: Color) -> String {
    match color {
        Color::White => "white".into(),
        Color::Black => "black".into(),
    }
}

pub fn parse_square(s: &str) -> Result<Square, String> {
    Square::from_ascii(s.trim().as_bytes()).map_err(|e| format!("invalid square '{s}': {e}"))
}

/// Parse a FEN piece letter ("R" = white rook, "p" = black pawn).
pub fn parse_piece_letter(letter: char) -> Result<(Color, Role), String> {
    let role = Role::from_char(letter.to_ascii_lowercase())
        .ok_or_else(|| format!("invalid piece letter '{letter}'"))?;
    let color = if letter.is_ascii_uppercase() {
        Color::White
    } else {
        Color::Black
    };
    Ok((color, role))
}

pub fn perft(pos: &Chess, depth: u32) -> u64 {
    shakmaty::perft(pos, depth)
}

#[cfg(test)]
mod tests {
    use super::*;

    const STARTPOS: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const KIWIPETE: &str =
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

    #[test]
    fn perft_matches_reference_depth_3_plus() {
        // P1 gate: perft matches published reference values at depth >= 3.
        let start = parse_fen(STARTPOS).unwrap();
        assert_eq!(perft(&start, 3), 8_902);
        assert_eq!(perft(&start, 4), 197_281);
        assert_eq!(perft(&start, 5), 4_865_609);

        let kiwipete = parse_fen(KIWIPETE).unwrap();
        assert_eq!(perft(&kiwipete, 3), 97_862);
        assert_eq!(perft(&kiwipete, 4), 4_085_603);
    }

    #[test]
    fn startpos_has_twenty_moves() {
        let pos = parse_fen(STARTPOS).unwrap();
        assert_eq!(legal_moves(&pos).len(), 20);
    }

    #[test]
    fn apply_and_result_roundtrip() {
        let pos = parse_fen(STARTPOS).unwrap();
        let moves = legal_moves(&pos);
        let m = find_move(&moves, "e2e4").unwrap();
        let next = pos.play(&m).unwrap();
        assert_eq!(
            to_fen(&next),
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        );
        assert_eq!(game_result(&next).status, "ongoing");
    }

    #[test]
    fn checkmate_is_a_win() {
        // Fool's mate.
        let pos = parse_fen("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")
            .unwrap();
        let r = game_result(&pos);
        assert_eq!(r.status, "win");
        assert_eq!(r.winner.as_deref(), Some("black"));
    }

    #[test]
    fn invalid_positions_are_rejected() {
        // Kingless positions are not standard chess: the full-rules path
        // must refuse them (the movement model in scenario.rs owns those).
        assert!(parse_fen("8/8/8/8/8/8/8/R7 w - - 0 1").is_err());
        assert!(parse_fen("not a fen").is_err());
    }
}
