// Which group the app is "in", and who the signed-in user is there.
//
// ── What a page can use ─────────────────────────────────────────────────────────────
//   const { … } = useActiveGroup();
//     myGroups          every group the user belongs to:
//                       [{ member_id, group_id, role, player_name, group_name, group }]
//     activeGroupId     the group the shell (header, tabs) is showing
//     activeGroup       its Group record (name, status, invite_code, defaults…) or null
//     activeMembership  the user's own row in it ({ member_id, role, player_name, … }) or null
//     isAdmin           the user is a group admin of the active group
//     loading           true until the list of groups has arrived
//     setActiveGroup(groupId)    open a group (the Groups list, an Activity note)
//     refreshGroups()            re-read the list (after create / join / leave / rename)
//     membershipIn(groupId)      the user's row in any of their groups, or null
//     syncGroupFromPage(groupId) see below
//     groupPending               see below
//     removedFrom       groups an admin took the user out of since the last look:
//                       [{ group_id, group_name }] (getMyGroups says so once; see below)
//     clearRemovedFrom()         forget them — the Groups page copies them and shows
//                                them once
//
// ── Taken out of a group ────────────────────────────────────────────────────────────
//   When an admin detaches the user's account from their player, or removes them, the
//   group simply drops out of the list. getMyGroups notices (the user's cached membership
//   points at a row that is no longer theirs) and reports it once in removed_from; they are
//   kept here until the Groups page takes them, so the notice is not lost when the list is
//   read from another page.
//
// ── The group comes from the page, not from memory ──────────────────────────────────
//   A session, round or player page is opened by its id alone, so it can belong to a group
//   other than the one last opened: a shared link, a bookmark, the browser's Back button.
//   Such a page says which group it belongs to as soon as it has loaded its record:
//
//     const { isAdmin, isArchived, group, membership } = usePageGroup(session?.group_id);
//
//   usePageGroup(groupId)
//     · pass the group_id of the record the page loaded — undefined or null while it is
//       still loading, and then the hook answers for the active group, exactly like
//       useActiveGroup();
//     · when that group is not the active one it becomes the active one (before the
//       browser paints), so the header, its "Archived" badge and the tabs — the Admin tab
//       included — describe the page on screen;
//     · it returns the user's standing in THAT group in the same render, so the admin
//       buttons of the group opened before never show, not even for a moment:
//         { groupId, group, membership, role: 'admin' | 'player' | null, isAdmin, isArchived }
//
//   syncGroupFromPage(groupId) is the same switch as a plain function, for code that is
//   not a component body (a callback after a fetch). Calling either with the group that
//   is already active does nothing, so they are safe to call on every load.
//
// ── The group of a history entry ────────────────────────────────────────────────────
//   /, /history, /profile and /admin carry no id: they show "the active group". So that
//   the browser's Back button returns to a page as it was left — Old Crew's standings, not
//   the standings of whichever group was opened since — the provider notes, for every
//   history entry (location.key), which group it was shown under, and switches back to
//   that group when the entry is visited again. The note is kept in memory only (nothing
//   new is stored on the device), so it lasts until the page is reloaded; after a reload
//   those pages show the last-opened group, as before.
//
//   groupPending is true for the short time in which the group is not known yet: an id
//   page opened directly (typed address, shared link), before it has reported its group.
//   The shell shows "…" instead of the last-opened group's name meanwhile. It gives up
//   after 2.5 seconds and falls back to the last-opened group, so a page that never
//   reports cannot leave the header empty.
import { createContext, useState, useContext, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const ActiveGroupContext = createContext();

// The last-opened group, kept across visits (the "On your device" line of /about).
const STORAGE_KEY = 'eos_activeGroupId';
const PENDING_GIVE_UP_MS = 2500;

// Which group each history entry of this visit was shown under: location.key -> group id.
const entryGroups = new Map();
const MAX_ENTRIES = 200;
function noteEntryGroup(key, groupId) {
  entryGroups.delete(key);
  entryGroups.set(key, groupId); // re-inserted, so the oldest notes are the first to go
  if (entryGroups.size > MAX_ENTRIES) entryGroups.delete(entryGroups.keys().next().value);
}

// Pages that belong to one group. `ownsItsGroup` pages are opened by id and learn their
// group from the record they load; the others show the active group.
const GROUP_PAGES = [
  { test: (p) => p === '/' },
  { test: (p) => p === '/history' },
  { test: (p) => p === '/profile' },
  { test: (p) => p === '/admin' },
  { test: (p) => p === '/session/new' },
  { test: (p) => p.startsWith('/session/'), ownsItsGroup: true },
  { test: (p) => p.startsWith('/round/'), ownsItsGroup: true },
  { test: (p) => p.startsWith('/player/'), ownsItsGroup: true },
];
const groupPageFor = (pathname) => GROUP_PAGES.find((page) => page.test(pathname)) || null;

/** True for a page that belongs to one group (standings, sessions, players, admin, a session, a round, a player). */
export const isGroupPage = (pathname) => !!groupPageFor(pathname);

const readStoredGroup = () => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
};

export const ActiveGroupProvider = ({ children }) => {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();
  const navigationType = useNavigationType();
  const page = groupPageFor(location.pathname);

  const [myGroups, setMyGroups] = useState([]);
  const [removedFrom, setRemovedFrom] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [loading, setLoading] = useState(true);
  // The history entry whose group is not known yet (see groupPending above).
  const [pendingKey, setPendingKey] = useState(null);
  const activeIdRef = useRef(activeGroupId);
  activeIdRef.current = activeGroupId;

  // A new history entry is on screen. Decided while rendering, not in an effect, so the
  // pages below never render — or start loading — under the group of the page before.
  const [seenKey, setSeenKey] = useState(null);
  if (seenKey !== location.key) {
    const firstPage = seenKey === null;
    setSeenKey(location.key);
    const noted = page && isAuthenticated ? entryGroups.get(location.key) || null : null;
    // Back / Forward return to an entry as it was shown — unless the user has left that
    // group since (an app admin may look at any group).
    const stillMine = user?.role === 'admin' || myGroups.some((g) => g.group_id === noted);
    if (noted && navigationType === 'POP' && noted !== activeGroupId && stillMine) setActiveGroupId(noted);
    // An id page opened from scratch: its group is unknown until the page reports it.
    setPendingKey(firstPage && page?.ownsItsGroup && !noted ? location.key : null);
  }

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
      const removed = Array.isArray(res.data.removed_from) ? res.data.removed_from : [];
      if (removed.length > 0) {
        setRemovedFrom((prev) => [...prev, ...removed.filter((g) => g?.group_id && !prev.some((p) => p.group_id === g.group_id))]);
      }

      // Keep the group on screen if it is still one of the user's; otherwise the one
      // remembered from the last visit; otherwise the first.
      const validIds = groups.map(g => g.group_id);
      const current = activeIdRef.current;
      const stored = readStoredGroup();
      if (current && validIds.includes(current)) {
        setActiveGroupId(current);
      } else if (stored && validIds.includes(stored)) {
        setActiveGroupId(stored);
      } else {
        setActiveGroupId(groups.length > 0 ? groups[0].group_id : null);
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
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
      entryGroups.clear();
      setMyGroups([]);
      setRemovedFrom([]);
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

  const activeMembership = myGroups.find(g => g.group_id === activeGroupId) || null;
  const activeGroup = activeMembership?.group || null;
  const isAdmin = activeMembership?.role === 'admin';

  // Remember the open group for the next visit — only a group the user really belongs
  // to (an app admin can look at a group they are not in; that is not "their" group).
  // Leaving for the Groups list does NOT forget it: Back must be able to return.
  useEffect(() => {
    if (!activeMembership) return;
    try { localStorage.setItem(STORAGE_KEY, activeMembership.group_id); } catch { /* storage unavailable */ }
  }, [activeMembership]);

  // Note which group this history entry is shown under (see the header comment).
  useEffect(() => {
    if (!page || !activeGroupId) return;
    noteEntryGroup(location.key, activeGroupId);
  }, [page, location.key, activeGroupId]);

  // Never leave the shell without a group name because a page did not report its own.
  useEffect(() => {
    if (!pendingKey) return undefined;
    const timer = setTimeout(() => setPendingKey(null), PENDING_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [pendingKey]);

  const setActiveGroup = useCallback((groupId) => {
    setActiveGroupId(groupId || null);
    setPendingKey(null);
  }, []);

  const clearRemovedFrom = useCallback(() => setRemovedFrom((prev) => (prev.length ? [] : prev)), []);

  const membershipIn = useCallback(
    (groupId) => myGroups.find((g) => g.group_id === groupId) || null,
    [myGroups],
  );

  // A page has loaded a record of this group, so the server let the user read it. If the
  // list here does not have the group, the list is out of date (joined in another tab, or
  // an app admin looking at a group they are not in): re-read it, once per group.
  const refreshedFor = useRef(null);
  const syncGroupFromPage = useCallback((groupId) => {
    if (!groupId) return;
    setActiveGroupId((current) => (current === groupId ? current : groupId));
    setPendingKey(null);
    if (!loading && !membershipIn(groupId) && refreshedFor.current !== groupId) {
      refreshedFor.current = groupId;
      refreshGroups();
    }
  }, [loading, membershipIn, refreshGroups]);

  const value = useMemo(() => ({
    myGroups,
    activeGroupId,
    activeGroup,
    activeMembership,
    isAdmin,
    loading,
    groupPending: pendingKey !== null && pendingKey === location.key,
    setActiveGroup,
    refreshGroups,
    membershipIn,
    syncGroupFromPage,
    removedFrom,
    clearRemovedFrom,
  }), [myGroups, activeGroupId, activeGroup, activeMembership, isAdmin, loading, pendingKey, location.key,
    setActiveGroup, refreshGroups, membershipIn, syncGroupFromPage, removedFrom, clearRemovedFrom]);

  return (
    <ActiveGroupContext.Provider value={value}>
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

/**
 * For a page that is opened by id (a session, a round, a player): tell the shell which
 * group the page belongs to, and get the user's standing in that group.
 *
 * @param {string|null|undefined} groupId  the group_id of the record the page loaded;
 *        empty while it is loading (the hook then answers for the active group).
 * @returns {{ groupId: string|null, group: object|null, membership: object|null,
 *             role: 'admin'|'player'|null, isAdmin: boolean, isArchived: boolean }}
 */
export function usePageGroup(groupId) {
  const { activeGroupId, membershipIn, syncGroupFromPage } = useActiveGroup();

  // Before paint, so the header never shows the previous group next to this page's
  // content. activeGroupId is a dependency on purpose: if anything else moves the active
  // group while this page is on screen, the page claims it back.
  useLayoutEffect(() => {
    if (groupId) syncGroupFromPage(groupId);
  }, [groupId, activeGroupId, syncGroupFromPage]);

  const id = groupId || activeGroupId || null;
  const membership = id ? membershipIn(id) : null;
  const group = membership?.group || null;
  return {
    groupId: id,
    group,
    membership,
    role: membership?.role || null,
    isAdmin: membership?.role === 'admin',
    isArchived: group?.status === 'archived',
  };
}
