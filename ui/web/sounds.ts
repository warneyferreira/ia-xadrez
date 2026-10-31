/** Sons locais sintetizados; nenhum asset externo ou chamada de rede. */
export class ChessSounds {
  private ctx: AudioContext | null = null;
  private enabled = false;
  constructor(button: HTMLButtonElement) {
    this.enabled = localStorage.getItem('chess-sound') === 'on';
    const render = () => {
      button.textContent = this.enabled ? 'Som ligado' : 'Som desligado';
      button.setAttribute('aria-pressed', String(this.enabled));
    };
    render();
    button.addEventListener('click', () => {
      this.enabled = !this.enabled;
      localStorage.setItem('chess-sound', this.enabled ? 'on' : 'off');
      render();
      if (this.enabled) void this.unlock();
    });
    document.addEventListener('pointerdown', () => void this.unlock(), { once: true });
    document.addEventListener('keydown', () => void this.unlock(), { once: true });
  }
  private async unlock() {
    if (!this.enabled) return;
    this.ctx ??= new AudioContext();
    await this.ctx.resume();
  }
  play(kind: 'move' | 'capture' | 'check' | 'castle' | 'end' | 'promotion') {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const notes = {
      move: [260],
      capture: [170, 120],
      check: [660, 880],
      castle: [330, 440],
      end: [440, 554, 660],
      promotion: [440, 660, 880],
    }[kind];
    notes.forEach((frequency, i) => {
      const oscillator = this.ctx!.createOscillator(),
        gain = this.ctx!.createGain();
      const start = this.ctx!.currentTime + i * 0.075;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.07, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      oscillator.connect(gain);
      gain.connect(this.ctx!.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.13);
    });
  }
}
