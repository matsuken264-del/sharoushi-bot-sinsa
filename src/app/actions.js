'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";

// 注: pdfjs-dist は不要になったのでインポートしません。
// 最新のGeminiはPDFデータを直接理解できるためです。

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) {
    throw new Error("GOOGLE_API_KEY が .env.local に設定されていません。");
}

const genAI = new GoogleGenerativeAI(API_KEY);

// ▼▼▼ RAG用：固定資料（業務取扱要領など）のURIリスト ▼▼▼
// ここは変更ありません。長大なマニュアルはクラウド上のファイルを参照させます。
const knowledgeBaseFiles = [
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/e470w7mibghu", mimeType: "application/pdf" }, // 0000147408.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/kmvetpsjgn54", mimeType: "application/pdf" }, // 001394849.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/8q5f14ydqy7p", mimeType: "application/pdf" }, // 001395102.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/tmach7ulcrrs", mimeType: "application/pdf" }, // 001461102.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/2mwgfu9elzj8", mimeType: "application/pdf" }, // 001467599.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/jv0odicz9bgp", mimeType: "application/pdf" }, // 001551858.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/ih54smii8xkw", mimeType: "application/pdf" }, // 001623787.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/gtixrhg2w1fb", mimeType: "application/pdf" }, // 001623788.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/0juutw4yr4gs", mimeType: "application/pdf" }, // 001623789.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/uq0pozgi3ufg", mimeType: "application/pdf" }, // 001623790.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/ywd6fj9v9p2c", mimeType: "application/pdf" }, // 001623791.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/691njj60qf37", mimeType: "application/pdf" }, // kaigokyuugyou.pdf
  { uri: "https://generativelanguage.googleapis.com/v1beta/files/2n4flokhjjw1", mimeType: "application/pdf" }, // kounenrei.pdf

];
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲


// システムプロンプト（審査手順）
const systemPrompt = `
あなたは、労働局のベテラン審査官です。
ユーザーから提供された審査対象書類（PDF形式の申請書や、画像形式の賃金台帳・出勤簿など）を精査してください。
画像データに手書きの文字や数字が含まれている場合は、視覚的に正確に読み取って判断材料としてください。

以下の【審査手順】を厳格に遵守して審査業務を行ってください。

【審査手順】
1. **提出された書類の内容確認**
   - 申請書等定形様式の記載漏れがないか確認する。
   - 書類全体を見て、様式が正しいか確認する。

2. **提出された書類の転記確認**
   - 賃金台帳・出勤簿等のデータと、申請書の数値を照合する。
   - 転記誤り、集計誤り、計算誤り（残業代の計算率など）がないか徹底的に計算チェックを行う。

3. **書類間の整合性確認**
   - 氏名、生年月日、雇用保険被保険者番号などが、全ての書類で一致しているか確認する。

4. **法令・要領への照合（※重要）**
   - 同時に提供されている知識ベース（PDF資料）にある「雇用保険業務取扱要領」を必ず参照すること。
   - 提出期限内の提出か、添付書類は足りているか、受給資格要件を満たしているかを判定する。

5. **審査結果の出力**
   - 以下の【出力フォーマット】に厳密に従って結果を出力すること。

---
【出力フォーマット】

## 1. 提出書類と認識状況
- **認識した書類:** [申請書(PDF)、賃金台帳(画像) など]
- **手書き文字の認識（画像がある場合）:** [良好 / 一部不明瞭 / 判読不能 / 該当なし]

## 2. 形式確認・転記チェック
- **結果:** [確認済み、不備なし / 転記誤りあり]
- **詳細:** (不備がある場合は、「賃金台帳の〇月の計がX円だが、申請書にはY円と記載されている」のように具体的に指摘)

## 3. 判定結果
1. **提出期限:** [提出期限内 / 提出期限切れ]
2. **添付書類:** [完備 / 〇〇が不足]
3. **受給資格:** [要件を満たしている / 要件を満たしていない]
   - (理由: 要領の規定〇〇に基づき確認したところ...)
4. **支給額:** [支給対象外 / ○月分：¥○○○,○○○]

## 4. 確認・注意事項
- (特になければ「特になし」)
---
`;


export async function generateAnswer(previousState, formData) {
  console.log("--- Action started (Multimodal Audit Mode) ---");

  const question = formData.get('question') || "";
  const uploadedFiles = formData.getAll('files');

  try {
    // モデル設定: 画像認識・PDF認識に強い最新モデルを指定
    const model = genAI.getGenerativeModel({ 
        model: "gemini-3-pro-preview", // または "gemini-1.5-pro"
        systemInstruction: systemPrompt 
    });

    // --- 1. 送信データの組み立て ---
    let promptParts = [];

    // A. RAG用固定資料（マニュアル類）を追加
    // クラウド上のURIを参照させます
    const fixedKnowledgeParts = knowledgeBaseFiles.map(file => ({
        fileData: {
            mimeType: file.mimeType,
            fileUri: file.uri
        }
    }));
    promptParts.push(...fixedKnowledgeParts);
    console.log(`[RAG] ${fixedKnowledgeParts.length} 冊のマニュアルを参照します。`);


    // B. ユーザーアップロード資料（審査対象）の処理 ★ここがポイント★
    // PDFであれ画像であれ、生のデータをBase64にしてAIに直接渡します。
    // AIは受け取ったデータの mimeType を見て、最適な方法で認識します。
    if (uploadedFiles && uploadedFiles.length > 0 && uploadedFiles[0].size > 0) {
        console.log(`[Upload] ${uploadedFiles.length} 件の審査書類を処理中...`);
        
        for (const file of uploadedFiles) {
            // ファイルの中身をバイナリデータとして読み込む
            const buffer = await file.arrayBuffer();
            // Base64文字列に変換
            const base64Data = Buffer.from(buffer).toString('base64');
            
            // AIへの入力データを作成
            promptParts.push({
                inlineData: {
                    data: base64Data,
                    // ここでファイルの正しい種類（'image/jpeg' や 'application/pdf'）をAIに伝えます
                    mimeType: file.type 
                }
            });
            console.log(` - Added: ${file.name} (${file.type}) -> AIへ直接送信`);
        }
    }

    // C. ユーザーの質問/指示を追加
    const userInstruction = question.trim() === "" 
        ? "アップロードされた書類を、業務取扱要領に基づいて審査してください。" 
        : question;
    
    promptParts.push({ text: userInstruction });


    // --- 2. AI生成実行 ---
    console.log("Generating content...");
    
    const result = await model.generateContent(promptParts);
    const response = await result.response;
    const text = response.text();

    console.log("Success!");
    return { answer: text };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { answer: `システムエラーが発生しました。\n(詳細: ${error.message})` };
  }
}