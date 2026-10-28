declare module "receiptline" {
  export interface PrinterConfig {
    cpl?: number;
    encoding?: string;
    command?: string;
    cutting?: boolean;
    spacing?: boolean;
    gamma?: number;
    gradient?: boolean;
    upsideDown?: boolean;
  }

  export function transform(doc: string, printer?: PrinterConfig): string;

  const receiptline: {
    transform: typeof transform;
  };

  export default receiptline;
}
