import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COPIED_FEEDBACK_MS = 1500;
const MASK = "•".repeat(16);

type SecretKeyFieldProps = {
  id: string;
  secret: string;
  keyPrefix: string;
};

// Masked by default; the prefix stays visible so the key can be matched to its row in the list.
// Copy always takes the full key, whether or not it is revealed.
export function SecretKeyField({ id, secret, keyPrefix }: SecretKeyFieldProps) {
  const { t } = useTranslation("apiKeys");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); revealing lets the key be selected by hand
      setRevealed(true);
    }
  }

  const revealLabel = revealed ? t("list.hide") : t("list.show");
  const copyLabel = copied ? t("list.copied") : t("list.copy");

  return (
    <div className="flex items-center gap-1">
      <Input
        id={id}
        readOnly
        value={revealed ? secret : `${keyPrefix}.${MASK}`}
        className="font-mono"
        spellCheck={false}
        autoComplete="off"
        onFocus={(event) => revealed && event.currentTarget.select()}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setRevealed((value) => !value)}
        aria-label={revealLabel}
        title={revealLabel}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={copy}
        aria-label={copyLabel}
        title={copyLabel}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
