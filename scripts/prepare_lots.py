"""Extract Manhattan lots (BoroCode 1) from NYC MapPLUTO 18v2.1 and write newline-delimited GeoJSON in WGS84.

Usage: python3 scripts/prepare_lots.py data/raw/MapPLUTO.shp data/build/mn_lots.geojsonl
"""
import sys, json
import pyogrio
import pandas as pd

src, out = sys.argv[1], sys.argv[2]

cols = ["BBL", "Address", "LandUse", "ZoneDist1", "BldgClass", "OwnerName",
        "NumFloors", "YearBuilt", "UnitsRes", "LotArea", "BldgArea", "HistDist", "Landmark",
        "Block", "Lot", "BoroCode"]

gdf = pyogrio.read_dataframe(src, columns=cols, where="BoroCode = 1")
gdf = gdf.to_crs(4326)
print("lots:", len(gdf))
print(gdf.dtypes)


def clean(v):
    if v is None:
        return None
    if isinstance(v, float):
        if pd.isna(v):
            return None
        return int(v) if v.is_integer() else round(v, 2)
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


n_missing_lu = 0
with open(out, "w") as f:
    for row in gdf.itertuples(index=False):
        props = {}
        for c in cols:
            props[c] = clean(getattr(row, c))
        # BBL as 10-digit string
        if props["BBL"] is not None:
            props["BBL"] = str(int(float(props["BBL"])))
        # LandUse as zero-padded 2-char code
        lu = props["LandUse"]
        if lu is not None:
            props["LandUse"] = str(int(float(lu))).zfill(2)
        else:
            n_missing_lu += 1
        # Drop zero-ish values that mean "unknown"
        for k in ("NumFloors", "YearBuilt"):
            if props[k] in (0, None):
                props[k] = None
        props = {k: v for k, v in props.items() if v is not None}
        feat = {"type": "Feature", "properties": props,
                "geometry": row.geometry.__geo_interface__}
        f.write(json.dumps(feat, separators=(",", ":")) + "\n")

print("missing LandUse:", n_missing_lu)
print(gdf["LandUse"].value_counts(dropna=False).to_dict())
print("NumFloors max:", gdf["NumFloors"].max())
