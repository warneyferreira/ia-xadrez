// SPDX-License-Identifier: GPL-3.0-or-later
// Chess Challenge team: optional, bounded critical-position time experiment.
#ifndef TOURNAMENT_TIME_H_INCLUDED
#define TOURNAMENT_TIME_H_INCLUDED

#include <cstddef>
#include <cstdint>

namespace Stockfish::TournamentTime {

// Extend the target only when the leading move remains unstable. The caller
// still enforces the native maximum; low-clock and forced replies are excluded.
constexpr double critical_factor(bool enabled, std::int64_t remainingMillis,
                                 std::int64_t incrementMillis, int gamePly,
                                 int depth, std::size_t legalMoves, double instability) {
    return enabled && incrementMillis == 0 && remainingMillis >= 15000
             && gamePly >= 16 && depth >= 10 && legalMoves > 1 && instability >= 1.0
           ? 1.20
           : 1.0;
}

}  // namespace Stockfish::TournamentTime
#endif
