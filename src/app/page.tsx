'use client';

import { useState, useRef, useEffect, useTransition, FormEvent, KeyboardEvent, ChangeEvent } from 'react';
import { generateAnswer } from './actions';
import { Send, Bot, User, Volume2, StopCircle, Loader2, Paperclip } from 'lucide-react';
// Markdown表示用のライブラリをインポート
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// メッセージの型定義
interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  files?: string[];
  isLoading?: boolean;
  isError?: boolean;
}

export default function Home() {
  // チャット履歴を管理するステート
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'ai',
      content: 'こんにちは！雇用保険審査業務自動化AIエージェント（育児休業等給付・継続給付編）（Gemini 3 Pro Preview搭載）です。\n\nRAG（要領）を駆使して判定します。PDF資料のアップロードが可能です。\n\n何かお手伝いできることはありますか？\n\n※注意事項・免責事項\n\n※個人情報の入力は行わないでください。\n\n※生成AIは誤った回答する場合があります。参考・補助に止め、元の資料等で確認するようにしてください。\n\n※AIの回答によって生じた損害については、一切責任を負いません。\n\n※技術実証用のテスト版です。ダミーデータを使用してください。'
    }
  ]);
  // 送信中のローディング状態
  const [isPending, startTransition] = useTransition();
  // 音声読み上げの状態管理
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  
  // synthRefに「SpeechSynthesis または null」が入ることを明示します
  const synthRef = useRef<SpeechSynthesis | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // --- 音声読み上げ機能 ---
  const handleSpeak = (text: string, messageId: string) => {
    if (!synthRef.current) return;

    if (synthRef.current.speaking) {
      synthRef.current.cancel();
      if (speakingMessageId === messageId) {
        setSpeakingMessageId(null);
        return;
      }
    }

    // Markdown記号などを読み上げさせないための簡易的なクレンジング
    const plainText = text
      .replace(/[#*`~\[\]()<>#-]/g, '') // 記号を除去
      .replace(/\n/g, '、') // 改行を読点に置換して少し間を持たせる
      .trim();

    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // 声質の選択を試みる処理
    const voices = synthRef.current.getVoices();
    const jpVoices = voices.filter(v => v.lang.includes('ja') || v.lang.includes('JP'));
    
    const preferredVoiceName = jpVoices.find(v => 
        v.name.includes('Google') ||
        v.name.includes('Ichiro') ||
        v.name.includes('Ayumi')
    );

    if (preferredVoiceName) {
        utterance.voice = preferredVoiceName;
    } else if (jpVoices.length > 0) {
        utterance.voice = jpVoices[0];
    }

    utterance.onstart = () => setSpeakingMessageId(messageId);
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    synthRef.current.speak(utterance);
  };


  // --- 送信ハンドラ ---
  const handleSubmit = async (formData: FormData) => {
    const question = formData.get('question') as string;
    const files = formData.getAll('files') as File[];
    if (!question?.trim() && files.length === 0) return;

    const userMessageId = Date.now().toString();
    const newUserMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: question,
      files: files.length > 0 ? Array.from(files).map(f => f.name) : []
    };
    setMessages(prev => [...prev, newUserMessage]);
    formRef.current?.reset();

    startTransition(async () => {
      const aiTempId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aiTempId, role: 'ai', content: '考え中...', isLoading: true }]);

      try {
        // generateAnswerの引数の型を一時的に回避するため any にキャスト
        const result = await generateAnswer(null, formData);
        
        setMessages(prev => prev.map(msg => 
          msg.id === aiTempId 
            ? { id: aiTempId, role: 'ai', content: result.answer, isLoading: false }
            : msg
        ));

      } catch (error: any) {
        setMessages(prev => prev.map(msg => 
          msg.id === aiTempId 
            ? { id: aiTempId, role: 'ai', content: `エラーが発生しました: ${error.message}`, isLoading: false, isError: true }
            : msg
        ));
      }
    });
  };

  return (
    <main className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
      
      {/* ヘッダー */}
      <header className="flex items-center p-4 bg-white dark:bg-gray-800 shadow-md z-10">
        <Bot className="w-8 h-8 text-blue-500 mr-3" />
        <h1 className="text-xl font-bold">雇用保険審査業務自動化AIエージェント（育児休業等給付・継続給付編）【技術実証用】 (Gemini 3 Pro Preview)</h1>
      </header>

      {/* チャットエリア */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* AIのアバター */}
            {msg.role === 'ai' && (
              <div className="flex-shrink-0 mr-3">
                <div className={`p-2 rounded-full ${msg.isError ? 'bg-red-100 text-red-500' : 'bg-blue-100 text-blue-500'} dark:bg-gray-700`}>
                  <Bot className="w-6 h-6" />
                </div>
              </div>
            )}

            {/* メッセージの吹き出し */}
            <div
              className={`relative max-w-[85%] p-4 rounded-2xl shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white rounded-tr-none'
                  : 'bg-white dark:bg-gray-800 dark:text-gray-100 rounded-tl-none border border-gray-200 dark:border-gray-700'
              }`}
            >
              {msg.isLoading && (
                <div className="flex items-center text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  考え中...
                </div>
              )}

              {!msg.isLoading && (
                // Markdownとして表示するコンポーネント。divで囲んでclassName型エラーを回避
                <div className="prose dark:prose-invert max-w-none leading-relaxed break-words">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            // リンクを新しいタブで開くように設定
                            a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline hover:text-blue-700" />
                        }}
                    >
                    {msg.content}
                    </ReactMarkdown>
                </div>
              )}
              
              {msg.files && msg.files.length > 0 && (
                 <div className="mt-2 text-sm text-blue-200 flex flex-wrap gap-2">
                   {msg.files.map((f,i) => (
                       <span key={i} className="flex items-center bg-blue-600 px-2 py-1 rounded">
                           <Paperclip className="w-3 h-3 mr-1"/> {f}
                       </span>
                   ))}
                 </div>
              )}

              {msg.role === 'ai' && !msg.isLoading && !msg.isError && (
                <button
                  onClick={() => handleSpeak(msg.content, msg.id)}
                  className="absolute -bottom-8 left-0 p-1 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                  title="読み上げ"
                >
                  {speakingMessageId === msg.id ? (
                    <StopCircle className="w-5 h-5 animate-pulse text-blue-500" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>

            {/* ユーザーのアバター */}
            {msg.role === 'user' && (
              <div className="flex-shrink-0 ml-3">
                <div className="p-2 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  <User className="w-6 h-6" />
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア (固定フッター) */}
      <footer className="p-4 bg-white dark:bg-gray-800 border-t dark:border-gray-700">
        <form ref={formRef} action={handleSubmit} className="max-w-5xl mx-auto">
          
          {/* 入力エリアとボタンを横並びにするレイアウト */}
          <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                name="question"
                placeholder="コメントを入力してください..."
                rows={2} // 初期高さを少し低く
                className="w-full p-3 bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-800 dark:text-gray-200"
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        formRef.current?.requestSubmit();
                    }
                }}
                />
            </div>
            {/* 送信ボタンをテキストエリアの外に出す */}
            <button
              type="submit"
              disabled={isPending}
              className="p-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex-shrink-0"
              title="送信 (Ctrl + Enter)"
            >
              {isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
            </button>
          </div>

          <div className="flex items-center justify-between mt-3 text-sm text-gray-600 dark:text-gray-400">
             <label htmlFor="file-upload" className="cursor-pointer flex items-center hover:text-blue-500">
                 <Paperclip className="w-5 h-5 mr-2" />
                 <span>審査対象資料をアップロード (PDF)</span>
                 <input
                    id="file-upload"
                    type="file"
                    name="files"
                    accept="application/pdf"
                    multiple
                    className="hidden" // input自体は隠す
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        // ファイルが選択されたら、ファイル名を入力欄に表示するなどの処理をここに追加できます
                        // 今回はシンプルにするため、特に何もしません
                    }}
                 />
             </label>
             <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                 Gemini 3 Pro Preview は誤った情報を生成する可能性があります。(Ctrl+Enterで送信)
             </p>
          </div>
        </form>
      </footer>
    </main>
  );
}