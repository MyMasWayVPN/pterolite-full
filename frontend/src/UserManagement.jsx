import React, { useState, useEffect } from 'react';
import { getUsers, createUser, deleteUser } from './api.js';

const UserManagement = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'user'
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await getUsers();
      setUsers(response.users);
    } catch (error) {
      console.error('Failed to load users:', error);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    
    if (!createForm.username || !createForm.email || !createForm.password) {
      setError('All fields are required');
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (createForm.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setCreateLoading(true);
    setError('');
    setSuccess('');

    try {
      await createUser({
        username: createForm.username,
        email: createForm.email,
        password: createForm.password,
        role: createForm.role
      });

      setSuccess(`User "${createForm.username}" created successfully`);
      setCreateForm({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'user'
      });
      setShowCreateForm(false);
      loadUsers();
    } catch (error) {
      console.error('Failed to create user:', error);
      setError(error.response?.data?.error || 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteUser = async (username) => {
    if (username === currentUser.username) {
      setError('Cannot delete your own account');
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete user "${username}"? This action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      await deleteUser(username);
      setSuccess(`User "${username}" deleted successfully`);
      loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      setError(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleFormChange = (e) => {
    setCreateForm({
      ...createForm,
      [e.target.name]: e.target.value
    });
    // Clear errors when user starts typing
    if (error) setError('');
  };

  const getRoleBadgeColor = (role) => {
    return role === 'admin' 
      ? 'bg-purple-900 text-purple-300 border-purple-700' 
      : 'bg-blue-900 text-blue-300 border-blue-700';
  };

  if (currentUser.role !== 'admin') {
    return (
      <div className="bg-dark-secondary rounded-lg shadow-dark p-6">
        <div className="text-center">
          <div className="text-4xl text-red-400 mb-4">🚫</div>
          <h3 className="text-xl font-semibold text-white mb-2">Access Denied</h3>
          <p className="text-gray-400">You need administrator privileges to access user management.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-secondary rounded-lg shadow-dark p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-white">User Management</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
        >
          Create User
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900 bg-opacity-30 border border-green-700 text-green-300 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl text-gray-400 mb-4">👥</div>
          <p className="text-gray-400">No users found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="bg-dark-tertiary">
                <th className="px-4 py-2 text-left text-white">Username</th>
                <th className="px-4 py-2 text-left text-white">Email</th>
                <th className="px-4 py-2 text-left text-white">Role</th>
                <th className="px-4 py-2 text-left text-white">Servers</th>
                <th className="px-4 py-2 text-left text-white">Created</th>
                <th className="px-4 py-2 text-left text-white">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-dark hover:bg-dark-tertiary transition-colors">
                  <td className="px-4 py-2 text-gray-300 font-medium">{user.username}</td>
                  <td className="px-4 py-2 text-gray-300">{user.email}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-300">{user.containerCount}</td>
                  <td className="px-4 py-2 text-gray-300 text-sm">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    {user.username !== currentUser.username ? (
                      <button
                        onClick={() => handleDeleteUser(user.username)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                      >
                        Delete
                      </button>
                    ) : (
                      <span className="text-gray-500 text-sm">Current User</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-dark-secondary rounded-lg p-6 w-full max-w-md mx-4 border border-dark">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Create New User</h3>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setError('');
                  setCreateForm({
                    username: '',
                    email: '',
                    password: '',
                    confirmPassword: '',
                    role: 'user'
                  });
                }}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  name="username"
                  value={createForm.username}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter username"
                  disabled={createLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={createForm.email}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter email address"
                  disabled={createLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                <select
                  name="role"
                  value={createForm.role}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={createLoading}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {createForm.role === 'admin' 
                    ? 'Admin: Full access to all features and user management'
                    : 'User: Limited to 1 server, can only see own servers'
                  }
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  name="password"
                  value={createForm.password}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter password (min 6 characters)"
                  disabled={createLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={createForm.confirmPassword}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Confirm password"
                  disabled={createLoading}
                />
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setError('');
                    setCreateForm({
                      username: '',
                      email: '',
                      password: '',
                      confirmPassword: '',
                      role: 'user'
                    });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
                  disabled={createLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating...
                    </div>
                  ) : (
                    'Create User'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="mt-6 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg p-4">
        <h4 className="font-semibold text-blue-300 mb-2">👥 User Management</h4>
        <div className="text-sm text-blue-200 space-y-1">
          <p>• <strong>Admin users:</strong> Full access to all features and can manage users</p>
          <p>• <strong>Regular users:</strong> Limited to 1 server, can only see their own servers</p>
          <p>• Users are automatically isolated - they cannot access each other's servers</p>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
