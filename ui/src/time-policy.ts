/** Reserva operacional: protege o tempo gasto depois que a busca já terminou. */
export class PhysicalTimePolicy {
  private samples: number[] = [];

  reset() {
    this.samples = [];
  }

  observe(millis: number) {
    if (Number.isFinite(millis) && millis >= 0) this.samples = [...this.samples.slice(-11), millis];
  }

  get overheadMillis() {
    // Até haver observações, 2 s por lance. Depois usamos p90 + 500 ms,
    // limitado para uma confirmação esquecida não arruinar as próximas buscas.
    if (!this.samples.length) return 2000;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return Math.round(Math.min(8000, Math.max(1500, sorted[Math.ceil(sorted.length * 0.9) - 1]! + 500)));
  }

  get reserveMillis() {
    return this.overheadMillis + 250;
  }

  snapshot() {
    return {
      overheadMillis: this.overheadMillis,
      reserveMillis: this.reserveMillis,
      observedMoves: this.samples.length,
    };
  }
}
