// src/app/actions.js (最新版: ハイブリッドRAG + Web検索機能ON)
'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";
// PDFをテキスト化するためのライブラリ (標準的なパスに修正済み)
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) {
    throw new Error("GOOGLE_API_KEY が .env.local に設定されていません。");
}

// 最新のSDKで初期化
const genAI = new GoogleGenerativeAI(API_KEY);

// ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
// ★ここに、upload_files.js で作成した最新のURIリストを貼り付けてください！★
const knowledgeBaseFiles = [
  // 例:
  // { uri: "https://generativelanguage.googleapis.com/...", mimeType: "application/pdf" },
  // { uri: "https://generativelanguage.googleapis.com/...", mimeType: "application/pdf" },
 { uri: "https://generativelanguage.googleapis.com/v1beta/files/g5z6ozqbp7rk", mimeType: "application/pdf" }, // 0000147408.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/54c5ufo93h74", mimeType: "application/pdf" }, // 001394849.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/sq5yt328o3hf", mimeType: "application/pdf" }, // 001395102.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/jodio5kuyuy9", mimeType: "application/pdf" }, // 001461102.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/ukiohpn16anw", mimeType: "application/pdf" }, // 001551858.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/z8spvz6vwgfn", mimeType: "application/pdf" }, // 001623787.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/sa9yl3s7wnrs", mimeType: "application/pdf" }, // 001623788.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/hh49j4sb56sa", mimeType: "application/pdf" }, // 001623789.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/twaeiv1bpkok", mimeType: "application/pdf" }, // 001623790.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/sbekr0ji5esi", mimeType: "application/pdf" }, // 001623791.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/fpiy19ykqefh", mimeType: "application/pdf" }, // kaigokyuugyou.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/un8co5kbwf4e", mimeType: "application/pdf" }, // kounenrei.pdf
];
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

/**
 * 画面からアップロードされたPDFファイルからテキストを抽出する関数
 */
async function extractTextFromPdf(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDocument = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }
        return fullText;
    } catch (error) {
        console.error("PDF Text Extraction Error:", error);
        return `(PDFファイルの読み込みに失敗しました: ${file.name})\n`;
    }
}

// Server Action (React 19対応: 引数に _ を追加)
export async function generateAnswer(_, formData) {
  console.log("--- Action started (Hybrid Mode: RAG + Upload) ---");

  const question = formData.get('question');
  // 画面からアップロードされたファイルを取得
  const uploadedFiles = formData.getAll('files');

  try {
    console.log("Connecting to Gemini API...");
    // 2026年時点の最新モデルを指定
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

    // --- 1. 固定の本棚 (RAG) の準備 ---
    // URIリストをAPIが読める形式に変換
    const fixedKnowledgeParts = knowledgeBaseFiles.map(file => ({
      fileData: {
        mimeType: file.mimeType,
        fileUri: file.uri
      }
    }));
    console.log(`[RAG] ${fixedKnowledgeParts.length} 冊の固定資料を準備しました。`);


    // --- 2. 画面からアップロードされた一時資料の準備 ---
    let temporaryContext = "";
    // ファイルがあり、かつ中身がある場合のみ処理
    if (uploadedFiles && uploadedFiles.length > 0 && uploadedFiles[0].size > 0) {
        console.log(`[Upload] ${uploadedFiles.length} 件の一時ファイルがアップロードされました。テキスト化を開始します...`);
        for (const file of uploadedFiles) {
            if (file.type === 'application/pdf') {
                const text = await extractTextFromPdf(file);
                temporaryContext += `\n【追加資料: ${file.name}】\n${text}\n`;
            } else {
                console.warn(`[Upload] 未対応またはPDF以外のファイル形式です: ${file.name} (${file.type})`);
            }
        }
        console.log("[Upload] テキスト化完了。");
    } else {
        console.log("[Upload] 一時ファイルはアップロードされていません。");
    }


    // --- 3. プロンプトの作成 (ハイブリッド: 改善版) ---
    const prompt = `
あなたは、社会保険・労働保険のプロとしての高度な専門知識を持つAIアシスタントです。

あなたには、以下の2種類の情報源が与えられています。
1. **[固定知識ベース]:** 業務取扱要領や法令などの膨大な専門資料（PDFファイル群）
2. **[追加資料]:** ユーザーが今、その場でアップロードした最新の資料（以下のテキストエリア）

ユーザーからの質問に対して、以下の優先順位とルールに従って回答してください。

【優先順位とルール】
1.  **情報源の特定:** 質問が「この資料」「アップロードした資料」などと特定の資料を指している場合は、まず下の【重要：今回ユーザーがアップロードした追加資料】の内容を最優先で確認してください。
2.  **情報源の統合:** 特定の指示がない場合は、[固定知識ベース]と[追加資料]の両方を組み合わせて回答してください。
3.  **情報の新旧:** 内容が矛盾する場合は、より新しい情報である可能性が高い[追加資料]の内容を優先してください。
4.  **根拠の明示:** 回答する際は、必ず「提供された資料（〇〇など）によると…」のように根拠を明示してください。特に[追加資料]に基づいている場合は、「アップロードされた追加資料によると…」と明記してください。
5.  **プロとしての態度:** 曖昧な表現を避け、正確で断定的な表現を心がけてください。
6.  **Web検索による補完:** 提供された資料（固定・追加）に記載がない事項については、**Google検索機能を使用して最新の情報を収集し**、それを基に回答してください。その際は、「Web検索の結果（〇〇などのサイト）によると…」のように、情報源を明記してください。
7.  **限界の認識:** 資料やWeb検索による補完によっても明確な回答が困難な場合は、その旨を回答すると共に、窓口等へ問い合わせるよう、誘導すること。それでもなお、AIとしての意見・見込みを問われた場合は、意見・見込みであることを明示したうえで回答すること。

あなたの使命は、これらの資料を駆使し、ユーザーの質問意図を正確に汲み取り、プロフェッショナルとして最も正確な回答を導き出すことです。

---
★★★【重要：今回ユーザーがアップロードした追加資料】★★★
（※ここに資料がない場合は「(なし)」と表示されます）
${temporaryContext ? temporaryContext : "(なし)"}
---

【質問】
${question}

【AIへの補足指示】
もし上記【質問】が、アップロードされた資料に関する内容（要約や内容確認など）であれば、[固定知識ベース]の内容は一旦脇に置き、上記の【重要：今回ユーザーがアップロードした追加資料】の内容のみに基づいて回答を作成してください。
`;

    // --- 4. AIによる回答生成 (Web検索機能ON) ---
    // プロンプト文字列を、APIが理解できるオブジェクト形式 { text: ... } に変換します
    const textPart = { text: prompt };

    // 変換したデータとプロンプトに加え、「Google検索ツール」を有効化する設定を渡します
    const result = await model.generateContent({
      // parts の中身は、すべてオブジェクトである必要があります
      contents: [{ role: 'user', parts: [textPart, ...fixedKnowledgeParts] }],
      tools: [
        // これが検索機能をONにする魔法の呪文です
        { googleSearch: {} }
      ]
    });
    
    const response = await result.response;
    const aiAnswer = response.text();

    console.log("Gemini Response Success!");
    
    return { 
      answer: aiAnswer,
      success: true 
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    let errorMessage = error.message;
    
    // エラーハンドリング
    if (error.message.includes("429")) {
        errorMessage = "申し訳ありません。現在アクセスが集中しており、AIが回答できません。しばらく時間をおいて、もう一度お試しください。(429 Too Many Requests)";
    } else if (error.message.includes("400") && error.message.includes("file")) {
         errorMessage = "ファイルの処理中にエラーが発生しました。ファイルの形式が無効か、サイズが大きすぎる可能性があります。";
    } else if (error.message.includes("403")) {
        errorMessage = "ファイルのアクセス権限エラーが発生しました。管理者にご連絡ください。(403 Forbidden)";
    }

    return { 
      answer: `AIエラーが発生しました。\n詳細: ${errorMessage}`,
      success: false
    };
  }
}