import { Link } from 'react-router';
import { Page } from './Page';

export function NotFound() {
  return (
    <Page title="Lost in the depths">
      <p className="mt-6 text-muted">
        This page polymorphed into something else.{' '}
        <Link to="/" className="text-ember underline-offset-4 hover:underline">
          Return to the surface
        </Link>
        .
      </p>
    </Page>
  );
}
