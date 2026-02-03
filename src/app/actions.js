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
 { uri: "https://generativelanguage.googleapis.com/v1beta/files/jadrwprvbkke", mimeType: "application/pdf" }, // 0000147408.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/a7pnsd6nwnuy", mimeType: "application/pdf" }, // 001394849.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/0t0dnjb37uzv", mimeType: "application/pdf" }, // 001395102.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/r39nbwf04oyi", mimeType: "application/pdf" }, // 001461102.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/ly1k3v92moiy", mimeType: "application/pdf" }, // 001467599.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/y00l5lggm74o", mimeType: "application/pdf" }, // 001551858.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/rf59yfc7pjwy", mimeType: "application/pdf" }, // 001623787.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/58boqgxxlzuv", mimeType: "application/pdf" }, // 001623788.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/rilrm0t1fmt4", mimeType: "application/pdf" }, // 001623789.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/di5hxq3zyqx7", mimeType: "application/pdf" }, // 001623790.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/1yjffbvrzdkv", mimeType: "application/pdf" }, // 001623791.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/mm4rn8e9uzw7", mimeType: "application/pdf" }, // kaigokyuugyou.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/upqy47hx2x4g", mimeType: "application/pdf" }, // kounenrei.pdf
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
あなたは、労働局のベテラン審査官です。
ユーザーからアップロードされた「申請書」と「添付書類（賃金台帳、出勤簿など）」を精査し、
以下の【審査手順】を厳格に遵守して審査業務を行ってください。

【審査手順】
1. **提出された書類の内容確認**
   - 申請書等定形様式の記載漏れがないか確認する。
   - 様式が最新かつ正しいか確認する。

2. **提出された書類の転記確認**
   - 賃金台帳・出勤簿等の添付書類と、申請書等の数値を照合する。
   - 転記誤り、集計誤り、計算誤り（残業代の計算率など）がないか徹底的に計算チェックを行う。

3. **書類間の整合性確認**
   - 氏名、生年月日、雇用保険被保険者番号などが、全ての書類で一致しているか確認する。
   - 資格取得日・喪失日などが矛盾していないか確認する。

4. **法令・要領への照合（※重要）**
   - 知識ベース（RAG）にある「雇用保険業務取扱要領」を必ず検索・参照すること。
   - 提出期限内の提出か、添付書類は足りているか、受給資格要件を満たしているかを判定する。
   - 支給額がある場合は、要領の規定に基づいて計算し、申請額と一致するか確認する。

5. **審査結果の出力**
   - 以下の【出力フォーマット】に厳密に従って結果を出力すること。

---
【出力フォーマット】

## 1. 形式確認・転記チェック
- **結果:** [確認済み、不備なし / 転記誤りあり]
- **詳細:** (転記誤りがある場合は、「賃金台帳の〇月の計がX円だが、申請書にはY円と記載されている」のように具体的に指摘)

## 2. 判定結果
1. **提出期限:** [提出期限内 / 提出期限切れ]
2. **添付書類:** [完備 / 〇〇が不足]
3. **受給資格:** [要件を満たしている / 要件を満たしていない]
   - (満たしていない場合の理由: 〇〇のため)
4. **支給額:** [支給対象外 / ○月分：¥○○○,○○○]

## 3. 確認・注意事項
- (特になければ「特になし」。疑義がある場合は「〇〇について確認推奨」と記述)

## 4. 次回案内
- (申請期限や次回必要な書類があれば記述)
---
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