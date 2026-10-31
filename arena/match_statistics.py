"""Resumo por par de cores, sem tratar as duas partidas como independentes."""
import math


def paired_summary(reports: list[dict], candidate: str) -> dict:
    scores = []
    clusters = {}
    points = 0
    for report in reports:
        if report["result"] == "*":
            continue
        white = report["white"] == candidate
        result = report["result"]
        points += 1 if result == "1/2-1/2" else 3 if (result == "1-0") == white else 0
    for offset in range(0, len(reports) - 1, 2):
        pair = reports[offset:offset + 2]
        if any(r["result"] == "*" for r in pair):
            continue
        values = []
        for r in pair:
            values.append(0.5 if r["result"] == "1/2-1/2" else float((r["result"] == "1-0") == (r["white"] == candidate)))
        score = sum(values) / 2
        scores.append(score)
        key = pair[0].get("opening_key", pair[0].get("opening", str(offset)))
        clusters.setdefault(key, []).append(score)
    # Hoeffding evita o intervalo de largura zero de bootstrap em séries só de empates.
    # É conservador, sem hipótese normal; pressupõe pares independentes.
    independent = [sum(values) / len(values) for values in clusters.values()]
    mean = sum(independent) / len(independent) if independent else None
    radius = math.sqrt(math.log(40) / (2 * len(independent))) if independent else None
    interval = [max(0.0, mean - radius), min(1.0, mean + radius)] if scores else None
    stable = not any(r.get("crash") or r["termination"] == "time forfeit" or r["result"] == "*" for r in reports)
    return {"completedPairs": len(scores), "distinctOpeningClusters": len(independent), "pairScore": mean, "score95": interval,
            "competitionPoints": points, "stable": stable,
            "evidenceOfSuperiority": bool(stable and len(independent) >= 40 and interval[0] > 0.5),
            "method": "95% Hoeffding sobre escore por par agrupado por posição inicial; pressupõe grupos independentes. Aberturas repetidas não aumentam a amostra efetiva. Não é Elo nem SPRT; seleção posterior do vencedor limita a inferência."}
