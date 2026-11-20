import { EtagMismatch } from 'pmtiles';

// PMTiles source for static hosts. PMTiles reads the archive with HTTP range requests. Right after a
// deploy, GitHub Pages' CDN can answer a range request with the whole file (200 instead of 206),
// and the stock FetchSource gives up on that tile. This source keeps the full file when that
// happens and serves every later read from memory (the archive is about 10 MB).
export class StaticHostSource {
  constructor(url) {
    this.url = url;
    this.mustReload = false;
    this.full = null; // Promise<{ data: ArrayBuffer, etag?: string }>
  }

  getKey() {
    return this.url;
  }

  async fromFull(offset, length) {
    const f = await this.full;
    return { data: f.data.slice(offset, offset + length), etag: f.etag };
  }

  async getBytes(offset, length, signal, etag) {
    if (this.full) return this.fromFull(offset, length);

    const res = await fetch(this.url, {
      signal,
      cache: this.mustReload ? 'reload' : undefined,
      headers: { range: `bytes=${offset}-${offset + length - 1}` },
    });

    let resEtag = res.headers.get('ETag');
    if (resEtag?.startsWith('W/')) resEtag = null;
    if (res.status === 416 || (etag && resEtag && resEtag !== etag)) {
      this.mustReload = true;
      this.full = null;
      throw new EtagMismatch(`Archive changed on the server (ETag ${etag} → ${resEtag}).`);
    }
    if (res.status >= 300) throw new Error(`Bad response code: ${res.status}`);

    const size = Number(res.headers.get('Content-Length'));
    if (res.status === 200 && (!size || size > length)) {
      this.full = res
        .arrayBuffer()
        .then((data) => ({ data, etag: resEtag || undefined }))
        .catch((err) => {
          this.full = null;
          throw err;
        });
      return this.fromFull(offset, length);
    }

    return {
      data: await res.arrayBuffer(),
      etag: resEtag || undefined,
      cacheControl: res.headers.get('Cache-Control') || undefined,
      expires: res.headers.get('Expires') || undefined,
    };
  }
}
