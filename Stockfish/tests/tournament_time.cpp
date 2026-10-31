// SPDX-License-Identifier: GPL-3.0-or-later
#include "../src/tournament_time.h"

using Stockfish::TournamentTime::critical_factor;
static_assert(critical_factor(false, 1500000, 0, 60, 20, 30, 2.0) == 1.0);
static_assert(critical_factor(true, 14999, 0, 60, 20, 30, 2.0) == 1.0);
static_assert(critical_factor(true, 1500000, 1000, 60, 20, 30, 2.0) == 1.0);
static_assert(critical_factor(true, 1500000, 0, 15, 20, 30, 2.0) == 1.0);
static_assert(critical_factor(true, 1500000, 0, 60, 9, 30, 2.0) == 1.0);
static_assert(critical_factor(true, 1500000, 0, 60, 20, 1, 2.0) == 1.0);
static_assert(critical_factor(true, 1500000, 0, 60, 20, 30, 0.99) == 1.0);
static_assert(critical_factor(true, 15000, 0, 16, 10, 2, 1.0) == 1.20);
static_assert(critical_factor(true, 1500000, 0, 60, 100, 200, 10000.0) == 1.20);
int main() {}
