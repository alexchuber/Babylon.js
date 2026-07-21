export class TestFileReader {
    public result: string | ArrayBuffer | null = null;
    public onerror: (() => void) | null = null;
    public onload: ((event: { target: TestFileReader }) => void) | null = null;
    public onloadend: (() => void) | null = null;
    public onprogress: (() => void) | null = null;

    public abort(): void {}

    public readAsArrayBuffer(file: Blob): void {
        void this._readAsync(file, true);
    }

    public readAsText(file: Blob): void {
        void this._readAsync(file, false);
    }

    private async _readAsync(file: Blob, useArrayBuffer: boolean): Promise<void> {
        try {
            this.result = useArrayBuffer ? await file.arrayBuffer() : await file.text();
            this.onload?.({ target: this });
        } catch {
            this.onerror?.();
        } finally {
            this.onloadend?.();
        }
    }
}
