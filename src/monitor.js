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
  async video(video) {
    if (!video || !/^\d+$/.test(video.id)) throw Error('Vídeo inválido');
    if (this.account.videos.includes(video.id)) return;
    // A primeira consulta estabelece a referência; não divulga vídeos antigos.
    if (this.account.videos.length) {
      await this.notify('video', { url: `https://www.tiktok.com/@${this.username}/video/${video.id}` });
    }
    this.account.videos = [video.id, ...this.account.videos].slice(0, 100);
    await this.persist(this.state);
  }
}
