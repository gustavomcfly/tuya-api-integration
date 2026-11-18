import { useApp, type View } from "./state/AppContext";
import { Shell } from "./components/layout/Shell";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { DevicePage } from "./pages/DevicePage";
import { DeviceSettingsPage } from "./pages/DeviceSettingsPage";
import { PasscodesPage } from "./pages/PasscodesPage";
import { CredentialsPage } from "./pages/CredentialsPage";
import { CyclicTestPage } from "./pages/CyclicTestPage";
import { QualityTestPage } from "./pages/QualityTestPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";

// Telas que dependem de um dispositivo selecionado.
const DEVICE_VIEWS: View[] = ["device", "deviceSettings", "passcodes", "credentials"];

export default function App() {
  const { user, view, device } = useApp();
  if (!user) return <LoginPage />;

  const current = DEVICE_VIEWS.includes(view) && !device ? "home" : view;

  return (
    <Shell>
      {current === "home" && <HomePage />}
      {current === "device" && <DevicePage key={device?.deviceId} />}
      {current === "deviceSettings" && <DeviceSettingsPage key={device?.deviceId} />}
      {current === "passcodes" && <PasscodesPage key={device?.deviceId} />}
      {current === "credentials" && <CredentialsPage key={device?.deviceId} />}
      {current === "cyclic" && <CyclicTestPage />}
      {current === "quality" && <QualityTestPage />}
      {current === "reports" && <ReportsPage />}
      {current === "settings" && <SettingsPage />}
    </Shell>
  );
}
