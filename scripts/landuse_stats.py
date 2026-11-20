"""Summarise Manhattan lots by land-use legend group (count and share of lot area).

Usage: python3 scripts/landuse_stats.py data/mn_lots.geojsonl src/data/landuse-stats.json
"""
import json
import sys
from collections import defaultdict

# Legend groups follow the course: walk-up (02) and elevator (03) multi-family share one colour.
GROUP = {"01": "01", "02": "02-03", "03": "02-03", "04": "04", "05": "05", "06": "06",
         "07": "07", "08": "08", "09": "09", "10": "10", "11": "11"}

src, out = sys.argv[1], sys.argv[2]
count = defaultdict(int)
area = defaultdict(float)
with open(src) as f:
    for line in f:
        p = json.loads(line)["properties"]
        g = GROUP.get(p.get("LandUse"), "nd")
        count[g] += 1
        area[g] += p.get("LotArea") or 0

total_area = sum(area.values())
stats = {
    "source": "NYC Department of City Planning, MapPLUTO 18v2.1 (Manhattan, BoroCode 1)",
    "totalLots": sum(count.values()),
    "totalLotAreaSqFt": round(total_area),
    "groups": {g: {"lots": count[g], "lotAreaSqFt": round(area[g]),
                   "lotAreaShare": round(area[g] / total_area, 4)} for g in sorted(count)},
}
with open(out, "w") as f:
    json.dump(stats, f, indent=2)
print(json.dumps(stats, indent=2))
