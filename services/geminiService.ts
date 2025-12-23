
import { GoogleGenAI } from "@google/genai";

const BASE_PROMPT = `あなたはPlantUML、特にSalt（UIプロトタイプ用モジュール）のエキスパートです。

提供されたUI画像を、PlantUML Saltの記法に変換してください。

以下の要件を厳守してください:
- 出力は必ずマークダウンのコードブロック ' \`\`\`plantuml ' で始めてください。
- コード内は '@startsalt' で始まり、'@endsalt' で終わる形式にしてください。
- **レイアウトの使い分けを徹底してください：**
  - **表形式や枠組みとして境界線が必要な箇所には、罫線付きグリッド '{+ }' を使用してください。**
  - **単なる位置合わせ（ラベルと入力フィールドの整列など）が目的で、視覚的に枠線が不要な場合は、罫線なしのグリッド '{ }' または {# } を使用し、無駄な罫線を出力しないでください。**
- **垂直方向の整列：** ラベルと入力フィールドが並ぶ場合は、グリッド記法を用いて、列の開始位置が綺麗に揃うようにしてください。
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
- 余計な説明やコメントは含めず、マークダウン形式のPlantUMLコードのみを出力してください。`;

/**
 * Returns the list of available Gemini models suitable for this task.
 */
export const getAvailableModels = async (): Promise<{ value: string; label: string }[]> => {
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

  if (fidelity <= 20) {
    finalPrompt += "\n- 主要なコンポーネントのみを抽出したシンプルな構成にしてください。";
  } else if (fidelity <= 80) {
    finalPrompt += "\n- レイアウトと主要なテキストをバランスよく再現してください。";
  } else {
    finalPrompt += "\n- **最重要事項：詳細再現モードです。オブジェクトの横方向の揃え（垂直アライメント）を完璧に再現してください。ラベルの長さが異なる場合でも、グリッド記法を用いて入力項目やボタンが縦に美しく整列するようにしてください。**";
    finalPrompt += "\n- **位置合わせのためのグリッドには罫線（+）を付けず、表として意味のある箇所にのみ罫線を使用してください。**";
    finalPrompt += "\n- 細部のスペーシングや、すべての細かいラベルまで極力再現してください。";
  }

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
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, textPart] },
    });
    
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

  const prompt = `あなたはPlantUML Saltのエキスパートです。
提供された元のUI画像と、現在のSaltコードを参考に、ユーザーの指示に従ってコードを修正してください。

現在のSaltコード:
${currentSalt}

ユーザーの修正指示:
${instruction}

要件:
- **位置合わせのためのグリッドには無駄な罫線を出力せず、視覚的に枠線が必要な箇所にのみ '{+ }' を使用してください。**
- **項目の縦方向の揃えが崩れないようにグリッド記法を適切に維持・修正してください。**
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
