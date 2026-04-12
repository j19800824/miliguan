declare module 'ali-oss' {
  type ClientOptions = {
    region: string;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    endpoint?: string;
  };

  type PutResult = {
    url: string;
    name: string;
  };

  export default class OSS {
    constructor(options: ClientOptions);
    put(
      name: string,
      file: Buffer,
      options?: {
        headers?: Record<string, string>;
      }
    ): Promise<PutResult>;
  }
}
