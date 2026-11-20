#!/usr/bin/env bash
# Rebuilds public/data/mn_lots.pmtiles from NYC MapPLUTO 18v2.1.
# Requirements: python3 with pyogrio + pandas + geopandas, and tippecanoe (https://github.com/felt/tippecanoe).
#
#   1. Download MapPLUTO 18v2.1 (shapefile) from NYC Planning's archive and unzip it into data/raw/
#      https://www.nyc.gov/site/planning/data-maps/open-data/bytes-archive.page
#   2. Run: ./scripts/build_tiles.sh data/raw/MapPLUTO.shp
set -euo pipefail

SRC="${1:-data/raw/MapPLUTO.shp}"
WORK="data/build"
mkdir -p "$WORK"

python3 scripts/prepare_lots.py "$SRC" "$WORK/mn_lots.geojsonl"
python3 scripts/landuse_stats.py "$WORK/mn_lots.geojsonl" src/data/landuse-stats.json

COMMON=(-q -f -l lots --detect-shared-borders --no-tiny-polygon-reduction --no-tile-size-limit --no-feature-limit -P)

# z12–13: only what the overview needs (colour, height, id) to keep first load light.
tippecanoe "${COMMON[@]}" -Z12 -z13 -y LandUse -y NumFloors -y BBL -o "$WORK/low.pmtiles" "$WORK/mn_lots.geojsonl"
# z14–16: every attribute shown in the lot popup. MapLibre overzooms beyond z16.
tippecanoe "${COMMON[@]}" -Z14 -z16 -o "$WORK/high.pmtiles" "$WORK/mn_lots.geojsonl"

tile-join -q -f --no-tile-size-limit \
  -n "Manhattan MapPLUTO 18v2.1" \
  -A "NYC Department of City Planning — MapPLUTO 18v2.1" \
  -o public/data/mn_lots.pmtiles "$WORK/low.pmtiles" "$WORK/high.pmtiles"

ls -lh public/data/mn_lots.pmtiles
