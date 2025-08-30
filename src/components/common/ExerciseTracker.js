import React, { useState, useEffect, useContext } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import AppContext from "../../contexts/AppContext";

import { Loader2, PlusCircle, Edit, Trash2 } from 'lucide-react';

// Exercise Tracker Component: Handles logging, viewing, editing, and deleting exercise activities.
const ExerciseTracker = ({ showCustomModal }) => {
    // Access Firebase services and user info from the global context.
    const { db, userId, isAuthenticated } = useContext(AppContext);

    // State for form inputs
    const [type, setType] = useState('');
    const [duration, setDuration] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [notes, setNotes] = useState('');

    // State for managing data and UI
    const [exerciseEntries, setExerciseEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null); // Tracks the ID of the entry being edited

    // useEffect to fetch exercise entries from Firestore in real-time.
    useEffect(() => {
        // Guard clause: Do not run if Firebase isn't ready or user is not logged in.
        if (!db || !userId || !isAuthenticated) {
            setLoading(false);
            return;
        }

        setLoading(true);
        // Define the path to the user's specific exercise entries collection.
        const userExercisePath = `users/${userId}/exerciseEntries`;

        // Create a Firestore query to get entries, ordered by the most recent timestamp.
        const q = query(collection(db, userExercisePath), orderBy('timestamp', 'desc'));

        // onSnapshot sets up a real-time listener for data changes.
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setExerciseEntries(fetchedEntries);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching exercise entries:", error);
            showCustomModal("Could not fetch exercise data. Please try again.");
            setLoading(false);
        });

        // Cleanup function to detach the listener when the component unmounts.
        return () => unsubscribe();
    }, [db, userId, isAuthenticated, showCustomModal]); // Effect dependencies

    // Handles the form submission for adding or updating an exercise entry.
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Input validation
        if (!type || !duration || !date || !time) {
            showCustomModal("Please fill in all required fields.");
            return;
        }
        if (isNaN(parseFloat(duration)) || parseFloat(duration) <= 0) {
            showCustomModal("Duration must be a positive number.");
            return;
        }

        // Prepare the data object for Firestore.
        const entryData = {
            type,
            duration: parseFloat(duration),
            date,
            time,
            notes,
            timestamp: new Date().toISOString()
        };

        try {
            const userExercisePath = `users/${userId}/exerciseEntries`;

            if (editingId) {
                // Update existing document if in editing mode.
                await updateDoc(doc(db, userExercisePath, editingId), entryData);
                showCustomModal("Exercise entry updated successfully!");
            } else {
                // Add a new document if not editing.
                await addDoc(collection(db, userExercisePath), entryData);
                showCustomModal("Exercise entry added successfully!");
            }
            resetForm(); // Reset the form fields.
        } catch (error) {
            console.error("Error adding/updating exercise entry:", error);
            showCustomModal("Failed to save exercise entry. Please try again.");
        }
    };

    // Resets all form fields to their default state.
    const resetForm = () => {
        setType('');
        setDuration('');
        setNotes('');
        setDate(new Date().toISOString().slice(0, 10));
        setTime(new Date().toTimeString().slice(0, 5));
        setEditingId(null);
    };

    // Populates the form with the data of the entry to be edited.
    const handleEdit = (entry) => {
        setEditingId(entry.id);
        setType(entry.type);
        setDuration(entry.duration);
        setDate(entry.date);
        setTime(entry.time);
        setNotes(entry.notes || '');
        window.scrollTo(0, 0); // Scroll to top to see the form.
    };

    // Deletes an entry after user confirmation.
    const handleDelete = (id) => {
        showCustomModal("Are you sure you want to delete this exercise entry?", async () => {
            try {
                const userExercisePath = `users/${userId}/exerciseEntries`;
                await deleteDoc(doc(db, userExercisePath, id));
                showCustomModal("Exercise entry deleted successfully!");
            } catch (error) {
                console.error("Error deleting exercise entry:", error);
                showCustomModal("Failed to delete exercise entry. Please try again.");
            }
        });
    };

    // Conditional rendering while data is loading.
    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                <p className="ml-2 text-gray-600">Loading exercise entries...</p>
            </div>
        );
    }

    // Main component JSX
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Log Your Exercise</h2>

            {/* Input Form */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="exerciseType" className="block text-sm font-medium text-gray-700">Exercise Type</label>
                        <input
                            type="text"
                            id="exerciseType"
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            placeholder="e.g., Walking, Yoga, Cycling"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="duration" className="block text-sm font-medium text-gray-700">Duration (minutes)</label>
                        <input
                            type="number"
                            id="duration"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            placeholder="e.g., 30"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="exerciseDate" className="block text-sm font-medium text-gray-700">Date</label>
                            <input
                                type="date"
                                id="exerciseDate"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="exerciseTime" className="block text-sm font-medium text-gray-700">Time</label>
                            <input
                                type="time"
                                id="exerciseTime"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="exerciseNotes" className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                        <textarea
                            id="exerciseNotes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows="3"
                            placeholder="e.g., Morning walk, High intensity, Felt good"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                        ></textarea>
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 flex items-center justify-center"
                    >
                        {editingId ? <><Edit className="w-5 h-5 mr-2" /> Update Entry</> : <><PlusCircle className="w-5 h-5 mr-2" /> Add Entry</>}
                    </button>
                    {editingId && (
                        <button
                            type="button"
                            onClick={resetForm}
                            className="w-full bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 mt-2"
                        >
                            Cancel Edit
                        </button>
                    )}
                </form>
            </div>

            {/* Recent Exercise Entries List */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Recent Exercise Entries</h3>
                {exerciseEntries.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No exercise entries yet. Add one above!</p>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {exerciseEntries.slice(0, 5).map((entry) => (
                            <li key={entry.id} className="py-3 flex justify-between items-center flex-wrap">
                                <div className="flex-grow">
                                    <p className="text-lg font-medium text-gray-900">{entry.type} ({entry.duration} min)</p>
                                    <p className="text-sm text-gray-500">{entry.date} at {entry.time}</p>
                                    {entry.notes && <p className="text-sm text-gray-600 italic mt-1">Notes: {entry.notes}</p>}
                                </div>
                                <div className="flex space-x-2 mt-2 sm:mt-0">
                                    <button
                                        onClick={() => handleEdit(entry)}
                                        className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                                        title="Edit"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(entry.id)}
                                        className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default ExerciseTracker;
