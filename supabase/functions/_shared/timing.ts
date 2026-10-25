// Mede o tempo de cada etapa de uma requisição (ms desde a etapa anterior)
let invocations = 0;

export class Timer {
  private start = performance.now();
  private last = this.start;
  readonly steps: Record<string, number> = {};
  // primeira chamada desta instância: inclui a "partida a frio" da função
  readonly cold = invocations++ === 0;

  mark(step: string) {
    const now = performance.now();
    this.steps[step] = Math.round(now - this.last);
    this.last = now;
  }

  summary() {
    return {
      ...this.steps,
      total: Math.round(performance.now() - this.start),
      cold: this.cold,
      region: Deno.env.get('SB_REGION') ?? null,
    };
  }
}
