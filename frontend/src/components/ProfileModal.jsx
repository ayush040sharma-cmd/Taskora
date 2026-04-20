import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/api";

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name cannot be empty"); return; }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.put("/auth/profile", { name: name.trim() });
      updateUser(data);
      setSuccess("Profile updated successfully!");
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Profile</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          {/* Avatar preview */}
          <div className="modal-avatar-row">
            <div className="modal-avatar">
              {name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?"}
            </div>
            <div className="modal-avatar-info">
              <div className="modal-avatar-name">{name || "Your Name"}</div>
              <div className="modal-avatar-email">{user?.email}</div>
            </div>
          </div>

          <div className="modal-field">
            <label className="modal-label">Full name</label>
            <input
              className="modal-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Email</label>
            <input
              className="modal-input modal-input--readonly"
              type="email"
              value={user?.email || ""}
              readOnly
            />
            <div className="modal-hint">Email cannot be changed</div>
          </div>

          {error   && <div className="modal-error">{error}</div>}
          {success && <div className="modal-success">{success}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-modal-save" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
