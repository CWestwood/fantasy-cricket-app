import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTeam } from "../context/TeamContext";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";

const ProfilePage = ({ onNavigate }) => {
  const navigate = useNavigate();
  const {
    username,
    teamName,
    updateUserUsername,
    updateUserTeamName,
    deleteUserAccount,
  } = useTeam();

  const [newUsername, setNewUsername] = useState(username || "");
  const [newTeamName, setNewTeamName] = useState(teamName || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  const CONFIRMATION_PHRASE = "Delete my account";

  const handleUpdateUsername = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!newUsername.trim()) {
      setError("Username cannot be empty.");
      return;
    }
    try {
      await updateUserUsername(newUsername);
      setSuccess("Username updated successfully!");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateTeamName = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!newTeamName.trim()) {
      setError("Team name cannot be empty.");
      return;
    }
    try {
      await updateUserTeamName(newTeamName);
      setSuccess("Team name updated successfully!");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteAccount = async () => {
    setError("");
    try {
      await deleteUserAccount();
      navigate("/login"); // Navigate to login after successful deletion
    } catch (err) {
      setError(`Failed to delete account: ${err.message}`);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-500 text-white px-4 py-6">
      <div className="max-w-md mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-primary-500 text-center">
          User Profile
        </h1>

        {error && <div className="text-center text-red-400">{error}</div>}
        {success && <div className="text-center text-green-400">{success}</div>}

        {/* Change Username */}
        <div className="bg-card-light rounded-2xl shadow-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Change Your Name</h2>
          <form onSubmit={handleUpdateUsername} className="space-y-3">
            <Input
              id="username"
              label="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Enter your new username"
            />
            <Button type="submit" variant="primary" className="w-full py-2">
              Update Username
            </Button>
          </form>
        </div>

        {/* Change Team Name */}
        <div className="bg-card-light rounded-2xl shadow-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Change Team Name</h2>
          <form onSubmit={handleUpdateTeamName} className="space-y-3">
            <Input
              id="teamName"
              label="Team Name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Enter your new team name"
            />
            <Button type="submit" variant="primary" className="w-full py-2">
              Update Team Name
            </Button>
          </form>
        </div>

        {/* Delete Account */}
        <div className="bg-card-light rounded-2xl shadow-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
          <p className="text-sm text-gray-300">
            Deleting your account is permanent and cannot be undone. All your
            team data will be lost.
          </p>
          <Button
            onClick={() => setShowDeleteConfirm(true)}
            variant="ghost"
            className="w-full py-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
          >
            Delete My Account
          </Button>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-card-dark rounded-lg p-6 max-w-sm mx-4 text-center space-y-4">
              <h3 className="text-lg font-bold text-red-400">Are you absolutely sure?</h3>
              <p className="text-sm text-gray-300 my-4">
                This action cannot be undone. To confirm deletion, please type "<strong>{CONFIRMATION_PHRASE}</strong>" below.
              </p>
              <Input
                id="delete-confirm"
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder={CONFIRMATION_PHRASE}
                className="text-center"
                autoFocus
              />
              <div className="flex justify-center gap-4">
                <Button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmInput("");
                  }}
                  variant="light"
                  className="py-2 px-6"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  className="py-2 px-6 bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-600 disabled:cursor-not-allowed"
                  disabled={deleteConfirmInput !== CONFIRMATION_PHRASE}
                >
                  Yes, Delete It
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;