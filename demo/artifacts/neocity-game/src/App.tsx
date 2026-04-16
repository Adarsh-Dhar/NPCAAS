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
  return (
    <QueryClientProvider client={queryClient}>
      <PlayerStateProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
      </PlayerStateProvider>
    </QueryClientProvider>
  );
}

export default App;
