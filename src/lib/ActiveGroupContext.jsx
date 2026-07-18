import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const ActiveGroupContext = createContext();

const STORAGE_KEY = 'eos_activeGroupId';

export const ActiveGroupProvider = ({ children }) => {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const [myGroups, setMyGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshGroups = useCallback(async () => {
    if (!isAuthenticated) {
      setMyGroups([]);
      setActiveGroupId(null);
      setLoading(false);
      return;
    }
    try {
      const res = await base44.functions.invoke('getMyGroups', {});
      const groups = res.data.groups || [];
      setMyGroups(groups);

      const stored = localStorage.getItem(STORAGE_KEY);
      const validIds = groups.map(g => g.group_id);

      if (stored && validIds.includes(stored)) {
        setActiveGroupId(stored);
      } else if (groups.length > 0) {
        const firstId = groups[0].group_id;
        setActiveGroupId(firstId);
        localStorage.setItem(STORAGE_KEY, firstId);
      } else {
        setActiveGroupId(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
      setMyGroups([]);
      setActiveGroupId(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoadingAuth) return;
    refreshGroups();
  }, [isLoadingAuth, refreshGroups]);

  // Clear state when signed out. Must set loading=FALSE: signed-out is a
  // terminal, not-loading state. Setting it true here stranded `loading` at
  // true for signed-out visitors (refreshGroups won't re-run while signed out),
  // which hung the root route `/` on an infinite spinner (P9-5c).
  useEffect(() => {
    if (!isAuthenticated && !isLoadingAuth) {
      localStorage.removeItem(STORAGE_KEY);
      setMyGroups([]);
      setActiveGroupId(null);
      setLoading(false);
    }
  }, [isAuthenticated, isLoadingAuth]);

  // Realtime: auto-fallback when removed from a group or role changes
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const unsubscribe = base44.entities.GroupMember.subscribe((event) => {
      if (event.data?.user_id === user.id) {
        refreshGroups();
      }
    });
    return unsubscribe;
  }, [isAuthenticated, user, refreshGroups]);

  const setActiveGroup = useCallback((groupId) => {
    setActiveGroupId(groupId);
    if (groupId) {
      localStorage.setItem(STORAGE_KEY, groupId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeMembership = myGroups.find(g => g.group_id === activeGroupId) || null;
  const activeGroup = activeMembership?.group || null;
  const isAdmin = activeMembership?.role === 'admin';

  return (
    <ActiveGroupContext.Provider value={{
      myGroups,
      activeGroupId,
      activeGroup,
      activeMembership,
      isAdmin,
      loading,
      setActiveGroup,
      refreshGroups,
    }}>
      {children}
    </ActiveGroupContext.Provider>
  );
};

export const useActiveGroup = () => {
  const context = useContext(ActiveGroupContext);
  if (!context) {
    throw new Error('useActiveGroup must be used within an ActiveGroupProvider');
  }
  return context;
};