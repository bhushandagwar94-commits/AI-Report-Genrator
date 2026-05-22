import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import System from "@/models/system";
import paths from "@/utils/paths";

export default function useRedirectToHomeOnOnboardingComplete() {
  const navigate = useNavigate();
  useEffect(() => {
    async function checkOnboardingComplete() {
      const isDevBypass = import.meta.env.DEV && import.meta.env.VITE_SKIP_ONBOARDING === "true";
      const onboardingComplete = await System.isOnboardingComplete();
      if (onboardingComplete === false && !isDevBypass) return;
      navigate(paths.home());
    }
    checkOnboardingComplete();
  }, []);
}
