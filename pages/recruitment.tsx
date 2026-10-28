import { withContentPage } from '@/lib/content/server';
import PageMeta from '@/components/layout/PageMeta';
import RecruitmentTool from '@/components/recruitment/RecruitmentTool';
import { getRecruitmentPageProps, recruitmentTables, type RecruitmentProps } from '@/lib/gacha/recruitmentPageData';

export default function RecruitmentPage(props: RecruitmentProps) {
  return <><PageMeta title="Recruitment Calculator" description="Pick your Arknights recruitment tags and see which operators they can give you." path="/recruitment" /><RecruitmentTool {...props} /></>;
}

export const getStaticProps = withContentPage("/recruitment", getRecruitmentPageProps, { tables: recruitmentTables });
