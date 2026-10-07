import crypto from 'crypto';

export class RequestFingerprint {
  static generate(payload: any): string {
    // Canonicalize payload
    // Sort keys, ignore undefined, format exactly
    const canonical = this.canonicalize(payload);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  private static canonicalize(obj: any): string {
    if (obj === null || obj === undefined) return '';
    if (typeof obj !== 'object') return String(obj);
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.canonicalize(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const parts = keys.map(k => {
      const val = obj[k];
      if (val === undefined) return '';
      return `${k}:${this.canonicalize(val)}`;
    }).filter(p => p !== '');
    return '{' + parts.join(',') + '}';
  }
}
