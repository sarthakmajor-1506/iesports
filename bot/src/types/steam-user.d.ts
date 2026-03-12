declare module 'steam-user' {
  class SteamUser {
    constructor(options?: any);
    logOn(details: any): void;
    on(event: string, callback: (...args: any[]) => void): this;
    [key: string]: any;
  }
  export = SteamUser;
}