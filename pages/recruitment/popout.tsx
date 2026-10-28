import { withContentPage } from '@/lib/content/server';
import PageMeta from '@/components/layout/PageMeta';
import RecruitmentTool from '@/components/recruitment/RecruitmentTool';
import { getRecruitmentPageProps, recruitmentTables, type RecruitmentProps } from '@/lib/gacha/recruitmentPageData';

export default function RecruitmentPopout(props: RecruitmentProps) {
  return <><PageMeta title="Recruitment Calculator" description="The Arknights recruitment calculator in a small window." path="/recruitment" noindex /><RecruitmentTool {...props} compact /></>;
}

RecruitmentPopout.hideSiteChrome = true;

export const getStaticProps = withContentPage("/recruitment/popout", getRecruitmentPageProps, { tables: recruitmentTables });
