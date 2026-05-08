import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GamePage from "@/pages/GamePage";
import DashboardPage from "@/pages/DashboardPage";
import { PlayerStateProvider } from "@/context/PlayerStateContext";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={GamePage} />
      <Route path="/dashboard">{() => <DashboardPage />}</Route>
    </Switch>
  );
}

function App() {
  const currentYear = new Date().getFullYear();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-black text-white">
        <PlayerStateProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </PlayerStateProvider>
        <footer className="border-t border-zinc-800 bg-black px-4 py-2 text-center text-xs text-zinc-400">
          {`Copyright (c) ${currentYear} Adarsh. Licensed under MIT.`}
        </footer>
      </div>
    </QueryClientProvider>
  );
}

export default App;
