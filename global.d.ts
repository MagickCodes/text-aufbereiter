export { };

declare global {
    const mammoth: {
        extractRawText: (options: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages: any[] }>;
    };

    const pdfjsLib: {
        GlobalWorkerOptions: { workerSrc: string };
        getDocument: (data: ArrayBuffer) => { promise: Promise<any> };
    };

    const jschardet: {
        detect: (buffer: Uint8Array) => { encoding: string; confidence: number };
    };

    const JSZip: {
        loadAsync: (data: ArrayBuffer) => Promise<any>;
    };

    const RTFJS: {
        Document: new (data: Uint8Array) => { get_plaintext: () => Promise<string> };
    };
}
