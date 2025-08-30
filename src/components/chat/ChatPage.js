import React from 'react';
import { 
    MessageSquare, Utensils, Database, Cloudy, Globe, HeartPulse, 
    BookOpen, ShoppingCart, Search, Send, Mic, X, ImageIcon as Image
} from 'lucide-react';
import CityFoodSuggestionsComponent from './features/CityFoodSuggestionsComponent';
import FoodLookupPage from './features/FoodLookupPage';
import WeatherFoodSuggestions from './features/WeatherFoodSuggestions';
import CulturalFoodExplorer from './features/CulturalFoodExplorer';
import SymptomRecommender from './features/SymptomRecommender';
import MythBuster from './features/MythBuster';
import SmartGroceryList from './features/SmartGroceryList';
import AnalyzingLoader from './AnalyzingLoader';
import NutrientFacts from './NutrientFacts';
import { renderBotMessage } from '../../utils/messageRenderer';
import { Bot, Play, Pause } from 'lucide-react';

const ChatPage = ({ messages, input, setInput, isLoading, isListening, handleSendMessage, toggleSpeechRecognition, handleTextToSpeech, isPlaying, messagesEndRef, suggestions, handleKeyPress, fact, handleImageUpload, imagePreview, clearImageUpload, onFeatureSelect, activeFeature }) => {
    // Determine which content to show based on the active feature
    const renderChatContent = () => {
        if (activeFeature === 'food-guide') {
            return <CityFoodSuggestionsComponent onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'food-lookup') {
            return <FoodLookupPage onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'weather-food') {
            return <WeatherFoodSuggestions onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'cultural-explorer') {
            return <CulturalFoodExplorer onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'symptom-recommender') {
            return <SymptomRecommender onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'myth-buster') {
            return <MythBuster onGoBack={() => onFeatureSelect('chat')} />;
        }
        if (activeFeature === 'grocery-list') {
            return <SmartGroceryList onGoBack={() => onFeatureSelect('chat')} />;
        }
        
        // This is the default chat content
        return (
            <>
                <div className="p-6 h-96 overflow-y-auto custom-scrollbar">
                    {messages.length === 0 && !isLoading && (
                        <div className="text-center text-gray-400 mt-20 animate-fade-in">
                            <p className="text-lg mb-2">Welcome to NutriBot AI!</p>
                            <p className="text-sm">Ask me anything about nutrition, healthy eating, or dietary advice.</p>
                            <p className="text-xs mt-4">Or try one of the suggestions below!</p>
                        </div>
                    )}
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex mb-4 animate-fade-in ${msg.sender === 'user' ? 'justify-end' : 'justify-start items-start'}`}
                        >
                            {msg.sender === 'bot' && (
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center mr-2 shadow-md">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                            )}
                            <div
                                className={`max-w-[85%] p-4 rounded-2xl shadow-lg relative ${
                                    msg.sender === 'user'
                                        ? 'bg-purple-700 bg-opacity-80 text-white rounded-br-none'
                                        : 'bg-indigo-900 bg-opacity-70 text-white rounded-bl-none border border-blue-700'
                                }`}
                            >
                                {/* Display uploaded image if it exists in the message */}
                                {msg.image && (
                                    <div className="mb-4">
                                        <img
                                            src={msg.image}
                                            alt="Uploaded ingredients"
                                            className="max-w-full h-auto rounded-lg shadow-md"
                                        />
                                    </div>
                                )}
                                {msg.sender === 'bot' ? (
                                    <>
                                        <div className="prose prose-invert max-w-none bot-prose">
                                            {renderBotMessage(msg.text)}
                                        </div>
                                        <button
                                            onClick={() => handleTextToSpeech(msg.text, index)}
                                            className="absolute bottom-1 right-2 p-1 rounded-full text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            title={isPlaying === index ? "Pause" : "Play"}
                                        >
                                            {isPlaying === index ? (
                                                <Pause className="w-4 h-4" />
                                            ) : (
                                                <Play className="w-4 h-4" />
                                            )}
                                        </button>
                                    </>
                                ) : (
                                    <p className="text-base leading-relaxed text-gray-200">{msg.text}</p>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <>
                            <AnalyzingLoader isImage={!!imagePreview}/>
                            <NutrientFacts fact={fact} />
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>
        
                <div className="px-6 py-4 border-t border-purple-700/50">
                    <h3 className="text-lg font-semibold text-purple-300 mb-2">Quick Questions</h3>
                    <div className="grid grid-rows-3 grid-flow-col gap-4 overflow-x-auto flex overflow-x-auto space-x-4 pb-2 custom-scrollbar-horizontal">
                        {suggestions.map((suggestion, index) => (
                            <button
                                key={index}
                                onClick={() => handleSendMessage(suggestion)}
                                className="flex-shrink-0 bg-gray-700 bg-opacity-70 border border-purple-600/50 text-gray-300 text-sm px-4 py-2 rounded-full shadow-lg hover:bg-gray-600 transition-all duration-300 transform hover:scale-105 active:scale-95 whitespace-nowrap"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-purple-700/50">
                    {/* Image Preview */}
                    {imagePreview && (
                        <div className="relative mb-4">
                            <img src={imagePreview} alt="Preview" className="h-24 w-24 object-cover rounded-xl border border-purple-600/50 shadow-lg" />
                            <button
                                onClick={clearImageUpload}
                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md"
                                title="Remove image"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    <div className="flex items-center space-x-4">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask about nutrients..."
                            className="flex-grow p-3 rounded-full bg-gray-700 bg-opacity-80 border border-purple-600/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner"
                            disabled={isLoading || isListening}
                        />
                        
                        {/* Hidden file input */}
                        <input
                            type="file"
                            id="image-upload"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                        />
                        {/* Button to trigger file input */}
                        <label htmlFor="image-upload" className={`p-3 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${isLoading ? 'bg-gray-500' : 'bg-gray-700'}`}>
                            <Image className="w-6 h-6 text-white" />
                        </label>

                        <button
                            onClick={toggleSpeechRecognition}
                            className={`p-3 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isListening ? 'bg-red-600' : 'bg-gray-700'}`}
                            disabled={isLoading}
                            title={isListening ? "Stop listening" : "Start voice input"}
                        >
                            <Mic className="w-6 h-6 text-white" />
                        </button>
                        <button
                            onClick={() => handleSendMessage()}
                            className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-3 rounded-full shadow-lg hover:from-purple-700 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isLoading || (input.trim() === '' && !imagePreview) || isListening}
                        >
                            <Send className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </>
        );
    };

    return (
       <div className="flex flex-col h-full">
            {/* Scrollable Feature Buttons Bar */}
            <div className="flex overflow-x-auto space-x-3 px-4 py-2 border-b border-purple-700/50 bg-gray-800 bg-opacity-70 custom-scrollbar-horizontal">
                {[
                    { id: 'chat', label: 'Chat', icon: <MessageSquare size={20} /> },
                    { id: 'food-guide', label: 'Food Guide', icon: <Utensils size={20} /> },
                    { id: 'food-lookup', label: 'Food Lookup', icon: <Database size={20} /> },
                    { id: 'weather-food', label: 'Weather Food', icon: <Cloudy size={20} /> },
                    { id: 'cultural-explorer', label: 'Explorer', icon: <Globe size={20} /> },
                    { id: 'symptom-recommender', label: 'Symptom Helper', icon: <HeartPulse size={20} /> },
                    { id: 'myth-buster', label: 'Myth Buster', icon: <BookOpen size={20} /> },
                    { id: 'grocery-list', label: 'Grocery & Prep', icon: <ShoppingCart size={20} /> },
                ].map(({ id, label, icon }) => (
                    <button
                        key={id}
                        onClick={() => onFeatureSelect(id)}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-full whitespace-nowrap transition-colors ${
                            activeFeature === id
                                ? 'bg-purple-700 text-white'
                                : 'text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        {icon}
                        <span className="text-sm hidden sm:inline">{label}</span>
                    </button>
                ))}
            </div>

            {/* Main content */}
            {renderChatContent()}
        </div>
    );
};

export default ChatPage;