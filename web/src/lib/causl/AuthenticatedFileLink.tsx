import { useAuthenticatedFileUrl } from "@/lib/causl/hooks";

interface AuthenticatedFileLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export default function AuthenticatedFileLink({
  href,
  children,
  ...props
}: AuthenticatedFileLinkProps) {
  const authenticatedUrl = useAuthenticatedFileUrl(href);
  return (
    <a {...props} href={authenticatedUrl} aria-disabled={!authenticatedUrl}>
      {children}
    </a>
  );
}
