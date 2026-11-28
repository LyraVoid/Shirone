export declare function escapeXml(value: unknown): string;
export declare function cdata(value: string): string;
export declare function stripInvalidXmlChars(str: string): string;
export declare function sanitizeMdxForFeed(raw: string): string;
export declare function renderFeedHtml(markdown: string): Promise<string>;
