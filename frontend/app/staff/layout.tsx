import StaffLayout from "@/components/staff/StaffLayout";

export const metadata = { title: "Staff — VNFood" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffLayout>{children}</StaffLayout>;
}
