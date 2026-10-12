/**
 * Dinheiro trafega em reais no JSON mas e armazenado e somado em centavos
 * (inteiro), para nao acumular erro de ponto flutuante no total do pedido.
 */

export function paraCentavos(reais) {
  // Math.round, nao Math.floor: 312.4 * 100 vale 31239.999999999996 em ponto
  // flutuante, e o floor jogava 1 centavo fora a cada unidade.
  return Math.round(Number(reais) * 100);
}

export function paraReais(centavos) {
  return Number((Number(centavos) / 100).toFixed(2));
}
