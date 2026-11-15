import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { AdminEfConfig } from './pages/AdminEfConfig';
import { AdminUsersDepts } from './pages/AdminUsersDepts';
import { AiDssAdvisor } from './pages/AiDssAdvisor';
import { Dashboard } from './pages/Dashboard';
import { LoginPage, SESSION_STORAGE_KEY } from './pages/LoginPage';
import { ManagerAudit } from './pages/ManagerAudit';
import { StaffDeclare } from './pages/StaffDeclare';
import type { User, UserRole } from './types/database';

const ROLE_DEFAULT_ROUTE: Record<UserRole, string> = {
  STAFF: '/staff/declare',
  MANAGER: '/manager/dashboard',
  ADMIN: '/admin/ef-config',
};

const ROLE_ALLOWED_ROUTES: Record<UserRole, string[]> = {
  STAFF: ['/staff/declare'],
  MANAGER: ['/manager/dashboard', '/manager/audit', '/manager/dss'],
  ADMIN: ['/admin/ef-config', '/admin/users-depts'],
};

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: User };
    if (
      parsed?.user &&
      typeof parsed.user.user_id === 'string' &&
      typeof parsed.user.role === 'string' &&
      parsed.user.status === 'ACTIVE'
    ) {
      return parsed.user;
    }
    return null;
  } catch {
    return null;
  }
}

export function App() {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [currentPath, setCurrentPath] = useState<string>(
    () => window.location.pathname
  );

  const navigate = useCallback((path: string, replace = false) => {
    if (window.location.pathname !== path) {
      if (replace) {
        window.history.replaceState({}, '', path);
      } else {
        window.history.pushState({}, '', path);
      }
    }
    setCurrentPath(path);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const effectivePath = !user
    ? '/login'
    : (ROLE_ALLOWED_ROUTES[user.role] ?? []).includes(currentPath)
      ? currentPath
      : ROLE_DEFAULT_ROUTE[user.role];

  // Keep browser URL in sync with RBAC-resolved route
  useEffect(() => {
    if (window.location.pathname !== effectivePath) {
      window.history.replaceState({}, '', effectivePath);
    }
  }, [effectivePath]);

  const handleLoginSuccess = (loggedInUser: User, redirectPath: string) => {
    setUser(loggedInUser);
    navigate(redirectPath, true);
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setUser(null);
    navigate('/login', true);
  };

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const renderProtectedPage = () => {
    if (user.role === 'STAFF') {
      return <StaffDeclare user={user} />;
    }

    if (user.role === 'MANAGER') {
      if (effectivePath === '/manager/audit') {
        return <ManagerAudit user={user} />;
      }
      if (effectivePath === '/manager/dss') {
        return <AiDssAdvisor user={user} />;
      }
      return <Dashboard />;
    }

    if (user.role === 'ADMIN') {
      if (effectivePath === '/admin/users-depts') {
        return <AdminUsersDepts user={user} />;
      }
      return <AdminEfConfig />;
    }

    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  };

  return (
    <div className="flex min-h-screen w-full bg-[#FAFAFA] text-[#09090B]">
      <Sidebar
        user={user}
        activePath={effectivePath}
        onNavigate={(path) => navigate(path)}
        onLogout={handleLogout}
      />
      <main className="flex-1 min-w-0">{renderProtectedPage()}</main>
    </div>
  );
}

export default App;
