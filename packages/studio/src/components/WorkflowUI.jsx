"use client";

import React, { useEffect, useState } from "react";

const WorkflowUI = ({ workflowId, initialNodeSchemas, initialWorkflowData }) => {
  const [WorkflowBuilder, setWorkflowBuilder] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    sessionStorage.setItem("fromWorkflowBuilder", "true");
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadBuilder() {
      try {
        // The workflow-builder workspace is optional in this fork. Avoid a static
        // import so Next can still compile when that package is not checked out.
        const mod = await Function("return import('workflow-builder')")();
        if (mounted) setWorkflowBuilder(() => mod.WorkflowBuilder || mod.default);
      } catch (error) {
        if (mounted) setLoadError(error?.message || "Workflow builder package is not available.");
      }
    }

    loadBuilder();

    return () => {
      mounted = false;
    };
  }, []);

  if (loadError) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <div className="text-sm font-black uppercase tracking-[0.2em] text-[#FF4500] mb-3">
            Workflow Builder indisponível
          </div>
          <p className="text-sm text-white/60 leading-relaxed">
            O workspace opcional <code className="text-white">workflow-builder</code> não está presente neste checkout.
            As outras abas do estúdio continuam funcionando normalmente.
          </p>
        </div>
      </div>
    );
  }

  if (!WorkflowBuilder) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/5 border-t-[#FF4500] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black">
      <WorkflowBuilder 
        workflowId={workflowId}
        initialNodeSchemas={initialNodeSchemas} 
        initialWorkflowData={initialWorkflowData}
        costType="dollars" 
      />
    </div>
  );
};

export default WorkflowUI;
