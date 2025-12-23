
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { convertImageToSalt, getAvailableModels, refineSalt } from './services/geminiService';
import * as pako from 'pako';

// --- PLANTUML ENCODING UTILS ---
const encode6bit = (b: number): string => {
  if (b < 10) return String.fromCharCode(48 + b);
  if (b < 36) return String.fromCharCode(65 + b - 10);
  if (b < 62) return String.fromCharCode(97 + b - 36);
  if (b === 62) return '-';
  if (b === 63) return '_';
  return '?';
};

const encode3bytes = (b1: number, b2: number, b3: number): string => {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) +
         encode6bit(c2 & 0x3f) +
         encode6bit(c3 & 0x3f) +
         encode6bit(c4 & 0x3f);
};

const encode64 = (data: Uint8Array): string => {
  let r = "";
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 < data.length) {
      r += encode3bytes(data[i], data[i + 1], data[i + 2]);
    } else if (i + 1 < data.length) {
      const b1 = data[i];
      const b2 = data[i + 1];
      const c1 = b1 >> 2;
      const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
      const c3 = (b2 & 0xf) << 2;
      r += encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f);
    } else {
      const b1 = data[i];
      const c1 = b1 >> 2;
      const c2 = (b1 & 0x3) << 4;
      r += encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f);
    }
  }
  return r;
};

const getPlantUMLUrl = (code: string): string => {
  if (!code) return "";
  try {
    let cleanCode = code.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();
    const utf8Encoder = new TextEncoder();
    const data = utf8Encoder.encode(cleanCode);
    const compressed = pako.deflate(data, { level: 9 });
    const encoded = encode64(compressed);
    return `https://plantuml.com/plantuml/svg/~1${encoded}`;
  } catch (e) {
    console.error("Encoding error", e);
    return "";
  }
};

const fileToBase64 = (file: File): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      const mimeType = result.split(';')[0].split(':')[1];
      if (base64 && mimeType) {
        resolve({ base64, mimeType });
      } else {
        reject(new Error('Failed to parse file data.'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

// --- CHILD COMPONENTS ---

interface ConversionOptionsProps {
  fidelity: number;
  onFidelityChange: (value: number) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  modelOptions: { value: string; label: string }[];
  disabled: boolean;
}

const ConversionOptions: React.FC<ConversionOptionsProps> = ({
  fidelity, onFidelityChange,
  selectedModel, onModelChange,
  modelOptions,
  disabled
}) => {
  const fidelityOptions = [
    { label: 'シンプル', value: 10 },
    { label: '標準', value: 50 },
    { label: '詳細', value: 100 },
  ];

  return (
    <section className="bg-slate-800 rounded-lg p-6 shadow-lg mb-8 border border-slate-700">
      <h2 className="text-xl font-semibold text-slate-200 mb-6">変換オプション</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label htmlFor="model-select" className={`text-slate-300 ${disabled ? 'text-slate-500' : ''}`}>
            使用モデル
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={disabled}
            className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className={`text-slate-300 ${disabled ? 'text-slate-500' : ''}`}>
            再現レベル
          </label>
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-700 p-1">
            {fidelityOptions.map((option) => (
              <div key={option.value}>
                <input
                  type="radio"
                  id={`fidelity-${option.value}`}
                  name="fidelity"
                  value={option.value}
                  checked={fidelity === option.value}
                  onChange={(e) => onFidelityChange(Number(e.target.value))}
                  disabled={disabled}
                  className="sr-only"
                />
                <label
                  htmlFor={`fidelity-${option.value}`}
                  className={`
                    block w-full text-center text-sm font-semibold rounded-md py-2 px-2 transition-colors duration-200
                    ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                    ${fidelity === option.value
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }
                  `}
                >
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

interface ImageInputProps {
  onImageSelect: (file: File) => void;
  onRetry: () => void;
  onCancel: () => void;
  imageFile: File | null;
  isLoading: boolean;
  elapsedTime: number;
  hasResult: boolean;
}

const ImageInput: React.FC<ImageInputProps> = ({ onImageSelect, onRetry, onCancel, imageFile, isLoading, elapsedTime, hasResult }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : null, [imageFile]);

  const handleFile = useCallback((file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      onImageSelect(file);
    }
  }, [onImageSelect]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!isLoading && e.clipboardData.files.length > 0) {
      handleFile(e.clipboardData.files[0]);
    }
  }, [handleFile, isLoading]);

  return (
    <section className="bg-slate-800 rounded-lg p-6 flex flex-col shadow-lg border border-slate-700">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-slate-200">入力イメージ</h2>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="text-slate-400 text-sm">変換中... ({elapsedTime}秒)</div>
          ) : hasResult && imageFile ? (
            <div className="text-slate-400 text-sm">完了 ({elapsedTime}秒)</div>
          ) : null}
          {isLoading ? (
            <button onClick={onCancel} className="px-3 py-1 bg-amber-600 rounded text-white text-sm hover:bg-amber-700">中断</button>
          ) : (
            <button onClick={onRetry} disabled={!imageFile} className="px-3 py-1 bg-blue-600 rounded text-white text-sm hover:bg-blue-700 disabled:opacity-50">リトライ</button>
          )}
        </div>
      </div>
      <div 
        className={`min-h-[300px] border-2 border-dashed rounded-md transition-colors flex items-center justify-center p-4 ${isDragging ? 'border-blue-500 bg-slate-700' : 'border-slate-600'} ${isLoading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); if (!isLoading) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onPaste={handlePaste}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <input type="file" ref={fileInputRef} onChange={(e) => handleFile(e.target.files?.[0] || null)} accept="image/*" className="hidden" disabled={isLoading} />
        {imageUrl ? (
          <img src={imageUrl} alt="Upload preview" className="max-w-full max-h-[500px] object-contain rounded" />
        ) : (
          <div className="text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            <p>画像をペースト、ドラッグ＆ドロップ</p>
            <p className="text-xs">またはクリックして選択</p>
          </div>
        )}
      </div>
    </section>
  );
};

interface RefinementControlProps {
  onRefine: (instruction: string) => void;
  isLoading: boolean;
}

const RefinementControl: React.FC<RefinementControlProps> = ({ onRefine, isLoading }) => {
  const [instruction, setInstruction] = useState("");
  const handleSubmit = () => { if (instruction.trim()) { onRefine(instruction); setInstruction(""); } };

  return (
    <section className="bg-slate-800 rounded-lg p-6 shadow-lg border border-slate-700">
      <h2 className="text-xl font-semibold text-slate-200 mb-4">修正指示</h2>
      <textarea
        className="w-full bg-slate-700 border border-slate-600 text-slate-200 rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 mb-4"
        rows={3}
        placeholder="例: グリッドを境界線付きに変更して、ボタンを右側に寄せて..."
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        disabled={isLoading}
      />
      <button
        onClick={handleSubmit}
        disabled={!instruction.trim() || isLoading}
        className="w-full bg-blue-600 py-3 rounded-lg text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg"
      >
        {isLoading ? '生成中...' : '修正を適用'}
      </button>
    </section>
  );
};

interface SaltPreviewProps {
  saltCode: string | null;
  isLoading: boolean;
  error: string | null;
}

const SaltPreview: React.FC<SaltPreviewProps> = ({ saltCode, isLoading, error }) => {
  const previewUrl = useMemo(() => saltCode ? getPlantUMLUrl(saltCode) : "", [saltCode]);

  return (
    <section className="bg-slate-800 rounded-lg p-6 flex flex-col shadow-lg border border-slate-700 h-[450px]">
      <h2 className="text-xl font-semibold text-slate-200 mb-4">レンダリング結果 (PlantUML)</h2>
      <div className="flex-grow bg-white rounded-md flex items-center justify-center overflow-auto p-4 border border-slate-600">
        {isLoading ? (
          <div className="animate-pulse flex flex-col items-center">
             <div className="h-32 w-48 bg-slate-200 rounded mb-4"></div>
             <p className="text-slate-400 text-sm">レンダリング中...</p>
          </div>
        ) : error ? (
           <div className="text-red-500 text-sm px-4 text-center">{error}</div>
        ) : previewUrl ? (
          <img src={previewUrl} alt="PlantUML Salt Preview" className="max-w-full max-h-full object-contain" />
        ) : (
          <div className="text-slate-400 text-sm">ここにプレビューが表示されます</div>
        )}
      </div>
    </section>
  );
};

interface CodeOutputProps {
  saltCode: string | null;
  isLoading: boolean;
}

const CodeOutput: React.FC<CodeOutputProps> = ({ saltCode, isLoading }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!saltCode) return;
    navigator.clipboard.writeText(saltCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-slate-800 rounded-lg p-6 flex flex-col shadow-lg border border-slate-700 h-[450px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-slate-200">PlantUML Salt コード</h2>
        <button
          onClick={handleCopy}
          disabled={!saltCode || isLoading}
          className="px-3 py-1 bg-indigo-600 rounded text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {copied ? 'コピー済み' : 'コードをコピー'}
        </button>
      </div>
      <div className="flex-grow bg-slate-900 rounded-md p-4 overflow-auto font-mono text-sm border border-slate-700 text-blue-300">
        {isLoading ? (
          <div className="space-y-2 opacity-30">
            <div className="h-4 bg-slate-700 w-3/4"></div>
            <div className="h-4 bg-slate-700 w-full"></div>
            <div className="h-4 bg-slate-700 w-1/2"></div>
          </div>
        ) : saltCode ? (
          <pre className="whitespace-pre-wrap"><code>{saltCode}</code></pre>
        ) : (
          <div className="text-slate-600">コードがここに表示されます</div>
        )}
      </div>
    </section>
  );
};

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saltCode, setSaltCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<number | null>(null);
  const isCancelledRef = useRef(false);

  const [fidelity, setFidelity] = useState(50);
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([
    { label: 'Gemini 3.0 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 3.0 Pro Preview', value: 'gemini-3-pro-preview' }
  ]);

  useEffect(() => {
    getAvailableModels().then(models => { if (models.length) setModelOptions(models); });
  }, []);

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    setSaltCode(null);
    setError(null);
    setElapsedTime(0);
  };

  const processConversion = useCallback(async () => {
    if (!imageFile) return;
    isCancelledRef.current = false;
    setIsLoading(true);
    setError(null);
    setElapsedTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => setElapsedTime(p => p + 1), 1000);

    try {
      const { base64, mimeType } = await fileToBase64(imageFile);
      const code = await convertImageToSalt(base64, mimeType, { fidelity, model: selectedModel });
      if (!isCancelledRef.current) setSaltCode(code);
    } catch (err: any) {
      if (!isCancelledRef.current) setError(err.message || "エラーが発生しました");
    } finally {
      setIsLoading(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [imageFile, fidelity, selectedModel]);

  const handleRefine = useCallback(async (instruction: string) => {
    if (!imageFile || !saltCode) return;
    setIsLoading(true);
    setError(null);
    try {
      const { base64, mimeType } = await fileToBase64(imageFile);
      const refined = await refineSalt(base64, mimeType, saltCode, instruction, selectedModel);
      setSaltCode(refined);
    } catch (err: any) {
      setError(err.message || "修正に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [imageFile, saltCode, selectedModel]);

  useEffect(() => { if (imageFile) processConversion(); }, [imageFile, processConversion]);

  return (
    <div className="bg-slate-900 text-white min-h-screen font-sans flex flex-col">
      <div className="container mx-auto p-6 lg:p-12 flex-grow">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 py-2">
            Image2Salt
          </h1>
          <p className="text-slate-400 mt-3 text-lg">UI画像をPlantUML Saltコードに瞬時に変換</p>
        </header>

        <ConversionOptions
          fidelity={fidelity}
          onFidelityChange={setFidelity}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          modelOptions={modelOptions}
          disabled={isLoading}
        />
        
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-8 flex flex-col">
            <ImageInput 
              onImageSelect={handleImageSelect} 
              onRetry={processConversion} 
              onCancel={() => { isCancelledRef.current = true; setIsLoading(false); }}
              imageFile={imageFile} 
              isLoading={isLoading} 
              elapsedTime={elapsedTime} 
              hasResult={!!saltCode || !!error}
            />
            {saltCode && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <RefinementControl onRefine={handleRefine} isLoading={isLoading} />
              </div>
            )}
          </div>
          <div className="space-y-8 flex flex-col">
            <SaltPreview saltCode={saltCode} isLoading={isLoading} error={error} />
            <CodeOutput saltCode={saltCode} isLoading={isLoading} />
          </div>
        </main>
      </div>

      <footer className="w-full text-center py-8 text-slate-500 text-sm border-t border-slate-800 bg-slate-900 mt-12">
        <p>PlantUML Salt形式で出力されます。公式レンダラーを使用してプレビューを表示しています。</p>
      </footer>
    </div>
  );
};

export default App;
