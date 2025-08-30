import React, { useState, useRef, useEffect, useContext } from 'react';
import { doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';
import AppContext from '../../contexts/AppContext';
import ChatPage from './ChatPage';
import ProfileModal from '../common/ProfileModal';
import HomePage from '../pages/HomePage';
import FeaturesPage from '../pages/FeaturesPage';
import { retryWithExponentialBackoff } from '../../utils/apiUtils';
import { pcmToWav, base64ToArrayBuffer } from '../../utils/audioUtils';
import { allSuggestions, isSpeechRecognitionSupported, SpeechRecognition } from '../../constants/suggestions';
import { Home, Zap, ChefHat } from 'lucide-react';

function NutriBotApp({ isAuthenticated, userId }) {
    const { db } = useContext(AppContext);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(null);
    const [isListening, setIsListening] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [currentPage, setCurrentPage] = useState('home');
    const [fact, setFact] = useState(null);
    const [imageUpload, setImageUpload] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [activeChatFeature, setActiveChatFeature] = useState('chat');

    const messagesEndRef = useRef(null);
    const audioRef = useRef(null);
    const speechRecognitionRef = useRef(null);

    // Set up Speech Recognition
    useEffect(() => {
        if (isSpeechRecognitionSupported) {
            speechRecognitionRef.current = new SpeechRecognition();
            speechRecognitionRef.current.continuous = false;
            speechRecognitionRef.current.interimResults = false;
            speechRecognitionRef.current.lang = 'en-US';

            speechRecognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setInput(transcript);
                handleSendMessage(transcript);
            };

            speechRecognitionRef.current.onend = () => {
                setIsListening(false);
            };

            speechRecognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
            };
        }
    }, []);

    // Scroll to the bottom of the chat when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle audio events
    useEffect(() => {
        if (audioRef.current) {
            const audio = audioRef.current;
            audio.onended = () => setIsPlaying(null);
        }
    }, [isPlaying]);

    // Fetch user profile from Firestore
    useEffect(() => {
        if (!db || !userId || !isAuthenticated) return;
        const fetchProfile = async () => {
            const docRef = doc(db, `users/${userId}/profile/info`);
            try {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const profileData = docSnap.data();
                    setUserProfile(profileData);
                } else {
                    setUserProfile(null);
                }
            } catch (error) {
                console.error("Error fetching user profile:", error);
                setUserProfile(null);
            }
        };
        fetchProfile();
    }, [db, userId, isAuthenticated]);

    // Save user profile to Firestore
    const saveUserProfile = async (profile) => {
        if (!db || !userId || !isAuthenticated) {
            console.error("Firebase not initialized or user ID not available.");
            return;
        }

        const docRef = doc(db, `users/${userId}/profile/info`);
        try {
            await setDoc(docRef, profile, { merge: true });
            setUserProfile(profile);
            setShowProfileModal(false);
        } catch (error) {
            console.error("Error saving user profile:", error);
        }
    };

    // Function to handle image upload
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Data = reader.result.split(',')[1];
                setImageUpload(base64Data);
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // Function to clear image preview
    const clearImageUpload = () => {
        setImageUpload(null);
        setImagePreview(null);
        setInput('');
    };

    // Function to call the Gemini API for text generation
    const getBotResponse = async (chatHistory, imageData) => {
        const apiChatHistory = chatHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        if (userProfile && userProfile.name) {
            const profilePrompt = `You are a nutrition expert. The user is named ${userProfile.name}, is ${userProfile.age} years old, has dietary restrictions of ${userProfile.restrictions}, and a health goal of ${userProfile.goal}. Respond to their queries based on this context.`;
            apiChatHistory.unshift({ role: "user", parts: [{ text: profilePrompt }] });
        } else {
            apiChatHistory.unshift({ role: "user", parts: [{ text: "You are a helpful and friendly nutrition expert. Generate responses with rich formatting using markdown-like syntax for bold text (**text**), lists (* list item), and horizontal rules (---) for a better UI." }] });
        }

        let payload;
        if (imageData) {
            const imagePrompt = input?.trim();
            payload = {
                contents: [{
                    role: "user",
                    parts: [
                        { text: imagePrompt },
                        {
                            inlineData: {
                                mimeType: "image/png",
                                data: imageData
                            }
                        }
                    ]
                }],
            };
        } else {
            payload = { contents: apiChatHistory };
        }

        const apiKey = "AIzaSyAqsq-uObIskeq8dk-1yVYgdYLH6fvPbs0";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        try {
            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const errorBody = await res.json();
                    throw new Error(`API error: ${res.status} ${res.statusText} - ${JSON.stringify(errorBody)}`);
                }
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0 &&
                response.candidates[0].content && response.candidates[0].content.parts &&
                response.candidates[0].content.parts.length > 0) {
                return response.candidates[0].content.parts[0].text;
            } else {
                console.error("Unexpected API response structure:", response);
                return "I'm sorry, I couldn't get a clear response. Please try again.";
            }
        } catch (error) {
            console.error("Error fetching from Gemini API:", error);
            return "Oops! Something went wrong while trying to get a response. Please check your internet connection or try again later.";
        }
    };

    // Function to fetch a single structured fact
    const fetchNutrientFacts = async () => {
        const prompt = "Provide 1 interesting and concise fact about a specific fruit and its nutrients.";
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];

        const responseSchema = {
            type: "OBJECT",
            properties: {
                "fact": { "type": "STRING" }
            },
            "propertyOrdering": ["fact"]
        };

        const payload = {
            contents: chatHistory,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        };

        const apiKey = "AIzaSyAqsq-uObIskeq8dk-1yVYgdYLH6fvPbs0";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        try {
            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    throw new Error(`API error: ${res.status}`);
                }
                return res.json();
            });

            if (response.candidates && response.candidates.length > 0) {
                const jsonText = response.candidates[0].content.parts[0].text;
                const parsedJson = JSON.parse(jsonText);
                setFact(parsedJson);
            }
        } catch (error) {
            console.error("Error fetching nutrient fact:", error);
            setFact({ fact: "Did you know... Bananas contain potassium, which helps regulate fluid balance and muscle contractions." });
        }
    };

    // Function to call the Gemini API for text-to-speech
    const handleTextToSpeech = async (text, index) => {
        if (audioRef.current && isPlaying === index) {
            audioRef.current.pause();
            setIsPlaying(null);
            return;
        }

        setIsPlaying(index);
        console.log("Attempting TTS for text:", text);
        const payload = {
            contents: [{ parts: [{ text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Rasalgethi" }
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };
        
        const apiKey = "AIzaSyAqsq-uObIskeq8dk-1yVYgdYLH6fvPbs0";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        try {
            const response = await retryWithExponentialBackoff(async () => {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const errorBody = await res.json();
                    throw new Error(`TTS API error: ${res.status} ${res.statusText} - ${JSON.stringify(errorBody)}`);
                }
                return res.json();
            });

            console.log("TTS API raw response:", response);

            const part = response?.candidates?.[0]?.content?.parts?.[0];
            const audioData = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;

            if (audioData && mimeType && mimeType.startsWith("audio/")) {
                console.log("Received audio data. MimeType:", mimeType, "Data length:", audioData.length);
                const sampleRateMatch = mimeType.match(/rate=(\d+)/);
                const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000;
                console.log("Determined sample rate:", sampleRate);

                const pcmData = base64ToArrayBuffer(audioData);
                console.log("PCM data ArrayBuffer created. Byte length:", pcmData.byteLength);

                const wavBlob = pcmToWav(pcmData, sampleRate);
                console.log("WAV Blob created. Size:", wavBlob.size, "Type:", wavBlob.type);

                const audioUrl = URL.createObjectURL(wavBlob);
                console.log("Audio URL created:", audioUrl);

                if (audioRef.current) {
                    audioRef.current.src = audioUrl;
                    audioRef.current.play();
                    console.log("Audio playback initiated.");
                } else {
                    console.warn("audioRef.current is null, cannot play audio.");
                }
            } else {
                console.error("Invalid TTS audio response: missing audioData or mimeType not starting with 'audio/'", response);
                setIsPlaying(null);
            }
        } catch (error) {
            console.error("Error with TTS API or audio processing:", error);
            setIsPlaying(null);
        }
    };

    // Handle sending a message (from text input or voice)
    const handleSendMessage = async (message = input) => {
        if ((message.trim() === '' && !imageUpload) || !isAuthenticated) return;

        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(null);
        }

        const newUserMessage = { sender: 'user', text: message.trim(), image: imagePreview, timestamp: new Date().toISOString() };
        const updatedMessages = [...messages, newUserMessage];
        setMessages(updatedMessages);
        setInput('');
        clearImageUpload();
        
        // Check for out-of-context questions
        const offTopicPhrases = [
            'who are you', 'what is your name', 'how were you created',
            'which model do you use', 'who made you', 'what are you',
            'how do you work', 'tell me about yourself',
            'what are you trained on', 'which model are you trained on',
            'who is your creator'
        ];
        const lowerCaseMessage = message.trim().toLowerCase();
        const isOffTopic = offTopicPhrases.some(phrase => lowerCaseMessage.includes(phrase));

        if (isOffTopic) {
            const cannedResponse = "I am NutriBot AI, an assistant dedicated to helping you with your nutrition and health questions. My purpose is to provide you with helpful information on food, diet, and wellness. Let's focus on that!";
            const newBotMessage = { sender: 'bot', text: cannedResponse };
            setMessages((prevMessages) => [...prevMessages, newBotMessage]);
            return;
        }

        setIsLoading(true);
        fetchNutrientFacts();

        const botResponseText = await getBotResponse(updatedMessages, imageUpload);

        const newBotMessage = { sender: 'bot', text: botResponseText };
        setMessages((prevMessages) => [...prevMessages, newBotMessage]);
        setIsLoading(false);
        setFact(null);
    };

    // Start/Stop speech recognition
    const toggleSpeechRecognition = () => {
        if (!isSpeechRecognitionSupported) {
            console.error('Your browser does not support Speech Recognition. Please use Chrome or a modern browser.');
            return;
        }

        if (isListening) {
            speechRecognitionRef.current.stop();
        } else {
            speechRecognitionRef.current.start();
        }
        setIsListening(!isListening);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !isLoading) {
            handleSendMessage();
        }
    };

    const renderPage = () => {
        if (!isAuthenticated) {
            return (
                <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
                     <div className="text-center p-6 rounded-xl bg-gray-700 border border-red-500">
                        <p className="text-lg text-red-400 mb-3">Not Logged In</p>
                        <p className="text-gray-300">Please log in or register to use the NutriBot AI assistant.</p>
                     </div>
                </div>
            )
        }
        
        switch (currentPage) {
            case 'home':
                return <HomePage onNavigate={setCurrentPage} />;
            case 'chat':
                return <ChatPage
                    messages={messages}
                    input={input}
                    setInput={setInput}
                    isLoading={isLoading}
                    isListening={isListening}
                    handleSendMessage={handleSendMessage}
                    toggleSpeechRecognition={toggleSpeechRecognition}
                    handleTextToSpeech={handleTextToSpeech}
                    isPlaying={isPlaying}
                    messagesEndRef={messagesEndRef}
                    suggestions={allSuggestions}
                    handleKeyPress={handleKeyPress}
                    fact={fact}
                    handleImageUpload={handleImageUpload}
                    imagePreview={imagePreview}
                    clearImageUpload={clearImageUpload}
                    onFeatureSelect={setActiveChatFeature}
                    activeFeature={activeChatFeature}
                />;
            case 'features':
                return <FeaturesPage onGoBack={() => setCurrentPage('home')} />;
            default:
                return <HomePage onNavigate={setCurrentPage} />;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4 font-inter text-white">
            <div className="relative w-full max-w-4xl bg-gray-800 bg-opacity-70 backdrop-filter backdrop-blur-lg rounded-3xl shadow-2xl overflow-hidden border border-purple-700/50 flex flex-col">
                
                {showProfileModal && <ProfileModal onSubmit={saveUserProfile} onClose={() => setShowProfileModal(false)} userProfile={userProfile} />}
                
                <div className="absolute inset-0 rounded-3xl pointer-events-none border-4 border-transparent animate-pulse-slow"
                     style={{
                         backgroundImage: 'linear-gradient(to right, #8B5CF6, #EC4899, #10B981)',
                         WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                         WebkitMaskComposite: 'xor',
                         maskComposite: 'exclude'
                     }}></div>

                <div className="p-6 w-full flex flex-col">
                    <div className="border-b border-purple-700/50 pb-6 mb-4 flex items-center justify-between">
                        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 tracking-wide">
                            NutriBot AI
                        </h1>
                        <div className="flex items-center space-x-4">
                            {userId && (
                                <span className="hidden md:inline text-purple-300 text-xs px-2 py-1 bg-gray-700 rounded-full">
                                    ID: {userId}
                                </span>
                            )}
                            <button
                                onClick={() => setCurrentPage('home')}
                                className="text-white p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                                title="Home"
                            >
                                <Home className="w-5 h-5 text-gray-300" />
                            </button>
                            <button
                                onClick={() => setCurrentPage('features')}
                                className="text-white p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                                title="View Features"
                            >
                                <Zap className="w-5 h-5 text-yellow-300" />
                            </button>
                            {isAuthenticated && (
                                <button
                                    onClick={() => setShowProfileModal(true)}
                                    className="group flex items-center text-purple-300 text-sm p-2 px-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                                >
                                    <ChefHat className="w-5 h-5 mr-2 text-purple-400 group-hover:animate-spin-slow" />
                                    {userProfile ? `Hello, ${userProfile.name}` : "Set up profile"}
                                </button>
                            )}
                        </div>
                    </div>
                    {renderPage()}
                </div>

                <audio ref={audioRef} className="hidden"></audio>
            </div>
        </div>
    );
}

export default NutriBotApp;