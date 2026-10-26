export class Monitor {
  constructor({ state, username, persist, notify }) {
    this.state = state;
    this.username = username;
    this.persist = persist;
    this.notify = notify;
    this.offlineCount = 0;
    this.account = state.accounts[username] ||= { live: false, videos: [] };
  }
  async live(isLive) {
    if (typeof isLive !== 'boolean') throw Error('Estado de live inválido');
    if (isLive) {
      this.offlineCount = 0;
      if (this.account.live) return;
      await this.notify('live', { url: `https://www.tiktok.com/@${this.username}/live` });
      this.account.live = true;
      await this.persist(this.state);
    } else if (++this.offlineCount >= 2 && this.account.live) {
      this.account.live = false;
      await this.persist(this.state);
    }
  }
  async replayVideo(id) {
    if (!id || this.account.replayedVideos?.includes(id)) return;
    if (!/^\d+$/.test(id)) throw Error('Vídeo de recuperação inválido');
    await this.notify('video', { url: `https://www.tiktok.com/@${this.username}/video/${id}` });
    this.account.replayedVideos = [id, ...(this.account.replayedVideos || [])].slice(0, 100);
    if (!this.account.videos.includes(id)) this.account.videos = [id, ...this.account.videos].slice(0, 100);
    await this.persist(this.state);
  }
  async video(result) {
    const videos = result?.videos || [result];
    if (!Array.isArray(videos) || !videos.length || videos.some(video => !video || !/^\d+$/.test(video.id))) throw Error('Vídeo inválido');
    const ids = [...new Set(videos.map(video => video.id))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
    const initial = this.account.videos.length === 0;
    const latest = ids.at(-1);
    if (initial) {
      const publishedAt = Number(BigInt(latest) >> 32n) * 1000;
      const age = Date.now() - publishedAt;
      // Recover a just-published post even when there is no baseline yet.
      if (age >= -300000 && age <= 3600000) {
        await this.notify('video', { url: `https://www.tiktok.com/@${this.username}/video/${latest}` });
      }
      this.account.videos = ids.toReversed().slice(0, 100);
      await this.persist(this.state);
      return;
    }
    const newestSeen = this.account.videos.reduce((max, id) => BigInt(id) > max ? BigInt(id) : max, 0n);
    for (const id of ids) {
      // Older pinned posts and posts falling out of the recent window are not new.
      if (BigInt(id) <= newestSeen || this.account.videos.includes(id)) continue;
      await this.notify('video', { url: `https://www.tiktok.com/@${this.username}/video/${id}` });
      this.account.videos = [id, ...this.account.videos].slice(0, 100);
      await this.persist(this.state);
    }
  }
}
