
import { GoogleGenAI } from "@google/genai";

// Fix: Ensure the base prompt is a valid template literal and properly terminated with a semicolon.
// Internal backticks are escaped to prevent potential parsing confusion in some environments.
const BASE_PROMPT = `あなたはPlantUML、特にSalt（UIプロトタイプ用モジュール）のエキスパートです。

提供されたUI画像を、PlantUML Saltの記法に変換してください。

以下の要件を厳守してください:
- 出力は必ずマークダウンのコードブロック ' \`\`\`plantuml ' で始めてください。
- コード内は '@startsalt' で始まり、'@endsalt' で終わる形式にしてください。
- レイアウトはグリッド '{ }' や、境界線付きグリッド '{+ }' を活用して正確に再現してください。
- 以下の主要なウィジェットを適切に使用してください:
  - ボタン: '[ボタン名]'
  - テキスト入力フィールド: '"テキスト"'
  - チェックボックス: '[ ]' または '[X]'
  - ラジオボタン: '( )' または '(X)'
  - コンボボックス: '^ドロップダウン^'
  - ツリー構造: '{T Tree構造 }'
  - 水平セパレータ: '--'
  - 垂直セパレータ: '||'
  - タブ: '{/ タブ1 | タブ2 | タブ3 }'
- 画像から読み取れるテキストを可能な限り正確に反映させてください。
- 配色（色名指定）はSaltの制限上、基本的なものに留めてください。
- 余計な説明やコメントは含めず、マークダウン形式のPlantUMLコードのみを出力してください。`;

/**
 * Returns the list of available Gemini models suitable for this task.
 * Static list is used to ensure compatibility and stability according to @google/genai patterns.
 */
export const getAvailableModels = async (): Promise<{ value: string; label: string }[]> => {
  // Static list of recommended models for text and multimodal tasks.
  return [
    { label: 'Gemini 3.0 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 3.0 Pro Preview', value: 'gemini-3-pro-preview' },
  ];
};

/**
 * Converts an image to PlantUML Salt code using Gemini multimodal capabilities.
 */
export const convertImageToSalt = async (
  base64Image: string,
  mimeType: string,
  options: { fidelity: number; model: string }
): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("APIキーが設定されていません。");
  }

  const { fidelity, model } = options;
  let finalPrompt = BASE_PROMPT;

  // Add fidelity specific instructions
  if (fidelity <= 20) {
    finalPrompt += "\n- 主要なコンポーネントのみを抽出したシンプルな構成にしてください。";
  } else if (fidelity <= 80) {
    finalPrompt += "\n- レイアウトと主要なテキストをバランスよく再現してください。";
  } else {
    finalPrompt += "\n- 細部のスペーシングや、すべての細かいラベルまで極力再現した詳細なSaltコードにしてください。";
  }

  // Fix: Correct initialization of GoogleGenAI using the named apiKey parameter.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType: mimeType,
    },
  };

  const textPart = {
    text: finalPrompt,
  };

  try {
    // Fix: Use the standard generateContent method for content generation.
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, textPart] },
    });
    
    // Fix: Access the text output via the .text property.
    return (response.text || "").trim();
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error("Gemini APIとの通信に失敗しました。");
  }
};

/**
 * Refines existing Salt code based on a user instruction and the original image.
 */
export const refineSalt = async (
  base64Image: string,
  mimeType: string,
  currentSalt: string,
  instruction: string,
  model: string
): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("APIキーが設定されていません。");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Fix: Construct the refinement prompt clearly.
  const prompt = `あなたはPlantUML Saltのエキスパートです。
提供された元のUI画像と、現在のSaltコードを参考に、ユーザーの指示に従ってコードを修正してください。

現在のSaltコード:
${currentSalt}

ユーザーの修正指示:
${instruction}

要件:
- PlantUML Saltの記法を維持しながら修正してください。
- 出力は修正後のコードのみをマークダウンのコードブロック ' \`\`\`plantuml ' で囲んで出力してください。`;

  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType: mimeType,
    },
  };

  const textPart = {
    text: prompt,
  };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, textPart] },
    });
    
    return (response.text || "").trim();
  } catch (error) {
    console.error("Gemini API error during refinement:", error);
    throw new Error("修正の生成に失敗しました。");
  }
};
