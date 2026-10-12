import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** True when the signed-in staff account has the admin role. */
export function useIsAdmin() {
  const { data } = useQuery({
    queryKey: ["is-desk-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_desk_admin");
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? false;
}
