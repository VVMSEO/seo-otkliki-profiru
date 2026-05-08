import { useState, useRef, useEffect } from 'react';
import { Send, Copy, Bot, User, Check, Sparkles, Trash2, LogIn, LogOut } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sendMessageStream, Message as AIMessage } from './services/ai';
import { cn } from './lib/utils';
import { auth, db, signIn, signOut } from './services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [chatId, setChatId] = useState<string>('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && !chatId) {
        // Generate a random chat ID when logged in, if we don't have one
        setChatId(Date.now().toString() + Math.random().toString(36).substring(7));
      } else if (!currentUser) {
        setChatId('');
        setMessages([]); // clear local chat on logout
      }
    });
    return () => unsubscribe();
  }, [chatId]);

  // Sync to firestore whenever messages change
  useEffect(() => {
    if (!user || messages.length === 0 || !chatId) return;

    const syncChat = async () => {
      try {
        const chatRef = doc(db, 'chats', chatId);
        const chatDoc = await getDoc(chatRef);
        
        if (!chatDoc.exists()) {
          await setDoc(chatRef, {
            userId: user.uid,
            messages: messages,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } else {
          await setDoc(chatRef, {
            userId: user.uid,
            messages: messages,
            createdAt: chatDoc.data().createdAt,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      } catch (error) {
        console.error('Error saving chat to Firebase:', error);
      }
    };

    syncChat();
  }, [messages, user, chatId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    
    // Create new chat session id if none exists and user is logged in
    if (user && !chatId) {
      setChatId(Date.now().toString() + Math.random().toString(36).substring(7));
    }

    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', content: userMsg };
    setMessages(prev => [...prev, newUserMsg]);
    setIsLoading(true);

    try {
      const history = messages.filter(m => m.content).map(m => ({
        role: (m.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content
      }));

      const responseStream = sendMessageStream(userMsg, history);

      const modelMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: modelMsgId, role: 'model', content: '' }]);

      for await (let text of responseStream) {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (newMessages[lastIndex].role === 'model') {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: newMessages[lastIndex].content + text
            };
          }
          return newMessages;
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', content: 'Произошла ошибка при генерации ответа. Пожалуйста, проверьте подключение и попробуйте еще раз.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    if (window.confirm('Вы уверены, что хотите очистить историю диалога?')) {
      setMessages([]);
      if (user) {
         setChatId(Date.now().toString() + Math.random().toString(36).substring(7));
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[calc(100vh-4rem)] border border-slate-200">
        
        {/* Header */}
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-200">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800 tracking-tight">SEO Отклики</h1>
              <p className="text-sm text-slate-500">Генератор ответов для Профи.ру</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mr-2"
                title="Очистить диалог"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600 hidden sm:inline-block">{user.email}</span>
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline-block">Выйти</span>
                </button>
              </div>
            ) : (
              <button
                onClick={signIn}
                className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Войти</span>
              </button>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4 opacity-60">
              <Bot className="w-16 h-16 text-slate-400" />
              <h2 className="text-xl font-medium text-slate-700">Готов к работе!</h2>
              <p className="text-slate-500">
                Вставьте сюда описание заказа от клиента. Я проанализирую его и составлю идеальный отклик до 500 символов с вовлекающим вопросом.
              </p>
              {!user && (
                 <p className="text-xs text-slate-400 mt-4">
                   Войдите в аккаунт, чтобы история ваших диалогов автоматически сохранялась.
                 </p>
              )}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-4 max-w-[85%]",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                  msg.role === 'user' ? "bg-slate-200 text-slate-600" : "bg-blue-100 text-blue-600"
                )}>
                  {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                
                <div className={cn(
                  "flex flex-col gap-1",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-5 py-3.5 rounded-2xl shadow-sm relative group",
                    msg.role === 'user' 
                      ? "bg-blue-600 text-white rounded-tr-sm" 
                      : "bg-white border border-slate-100 text-slate-800 rounded-tl-sm"
                  )}>
                    {msg.role === 'model' ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                    )}

                    {msg.role === 'model' && (
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-md text-slate-500 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        title="Копировать текст"
                      >
                        {copiedId === msg.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                  
                  {msg.role === 'model' && (
                    <div className="flex items-center gap-2 px-1">
                      <span className={cn(
                        "text-xs font-medium",
                        msg.content.length > 500 ? "text-red-500" : "text-slate-400"
                      )}>
                        {msg.content.length} / 500 символов
                      </span>
                      {msg.content.length > 500 && (
                        <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                          Превышен лимит!
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-4 max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-5 h-5" />
              </div>
              <div className="px-5 py-4 bg-white border border-slate-100 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100 shrink-0">
          <div className="max-w-4xl mx-auto relative flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Вставьте описание заказа или напишите сообщение..."
              className="w-full max-h-48 min-h-[56px] bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none transition-all text-sm"
              rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 6) : 1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 bottom-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center mt-2">
            <p className="text-xs text-slate-400">
              Нажмите Enter для отправки, Shift + Enter для переноса строки
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
