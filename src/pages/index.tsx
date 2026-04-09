import type { GetStaticProps, NextPage } from 'next';
import Link from 'next/link';
import { ALL_APPS, AppDef } from '@/lib/config';
import Layout from '@/components/Layout';

type Props = { apps: Pick<AppDef, 'slug' | 'name' | 'description' | 'password'>[] };

const Home: NextPage<Props> = ({ apps }) => {
  return (
    <Layout title="AI Form">
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold mb-6">ミニアプリ一覧</h1>
        <ul className="grid gap-3">
          {apps.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/${a.slug}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 hover:shadow-sm transition"
              >
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{a.name}</h2>
                  {a.password ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      パスワード保護
                    </span>
                  ) : null}
                </div>
                {a.description ? (
                  <p className="text-sm text-slate-600 mt-1">{a.description}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {
      apps: ALL_APPS.map((a) => ({
        slug: a.slug,
        name: a.name,
        description: a.description,
        password: a.password ?? null,
      })),
    },
  };
};

export default Home;
