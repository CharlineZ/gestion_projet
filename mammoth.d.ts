declare module 'mammoth' {
  interface ExtractRawTextInput {
    buffer?: Buffer;
    path?: string;
  }
  interface ExtractRawTextResult {
    value: string;
    messages: unknown[];
  }
  interface ConvertToHtmlInput {
    buffer?: Buffer;
    path?: string;
  }
  interface ConvertToHtmlResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(input: ExtractRawTextInput): Promise<ExtractRawTextResult>;
  export function convertToHtml(input: ConvertToHtmlInput): Promise<ConvertToHtmlResult>;
  const mammoth: {
    extractRawText: typeof extractRawText;
    convertToHtml: typeof convertToHtml;
  };
  export default mammoth;
}
